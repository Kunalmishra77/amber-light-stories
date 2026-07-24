"""Runs the whole short-form pipeline for one story end to end:

    load story+scenes -> plan_scene (decision engine) per scene
    -> execute_keyframe (reuse asset/cache if a hit, else generate)
    -> execute_motion -> execute_voice (full narration)
    -> render_video (final 9:16 assembly) -> execute_thumbnail
    -> execute_metadata -> persist assets rows + pipeline_stages updates

`run_pipeline` accepts either a `story_id` (str) -- loaded from Supabase --
or a `StoryDoc`/story-shaped object directly, which is how the test suite
and render_dryrun exercise it without necessarily touching Supabase.

live=False (the default, and the only mode exercised anywhere in this
repo's tests / render_dryrun) makes ZERO paid API calls: every executor
runs its local/mock branch, so the whole run costs $0 and still produces a
REAL playable 1080x1920 mp4 with placeholder visuals + silent narration.
"""
import time
from pathlib import Path
from types import SimpleNamespace

from app.config import get_settings
from app.supabase_client import get_supabase
from pipeline import asset_library, executors, prompt_cache, render
from pipeline.cost_governor import CostGovernor
from pipeline.decision import plan_scene
from pipeline.model_routing import DEFAULT_ROUTING, load_model_routing


# --------------------------------------------------------------------------
# offline (no-Supabase) stand-ins for asset_library / prompt_cache -- used
# only when run_pipeline is called with an in-memory StoryDoc rather than a
# story_id, so tests never need a live Supabase connection.
# --------------------------------------------------------------------------

class _NullAssetLibrary:
    @staticmethod
    def search(query, project_id, character_id=None, threshold=0.82):
        return None


class _NullPromptCache:
    def __init__(self):
        self._store: dict[str, dict] = {}

    def get(self, key):
        return self._store.get(key)

    def put(self, key, kind, model, asset_id, prompt):
        self._store[key] = {"asset_id": asset_id, "kind": kind, "model": model, "prompt": prompt}
        return self._store[key]


# --------------------------------------------------------------------------
# reconstructing a story-shaped object from Supabase rows (mirrors the
# flattening pipeline.persist.persist_story does on the way in)
# --------------------------------------------------------------------------

class _NS(SimpleNamespace):
    """A SimpleNamespace that also exposes `.model_dump()` (recursively),
    so scenes/stories reconstructed from Supabase rows are accepted both by
    attribute access (this module, pipeline.executors) and by
    pipeline.decision.plan_scene's `_as_dict`, which special-cases
    `hasattr(obj, "model_dump")` exactly like a pydantic model."""

    def model_dump(self) -> dict:
        out = dict(vars(self))
        for k, v in out.items():
            if isinstance(v, _NS):
                out[k] = v.model_dump()
        return out


def _prompt_ns(prompt: dict) -> _NS:
    prompt = prompt or {}
    return _NS(**{k: v for k, v in prompt.items()
                   if k not in ("asset_query", "animation_required")})


def _load_character_refs(sb, scene_rows: list[dict]) -> dict:
    """Map character_id -> {"reference": str, "seed": int|None} for every
    character the story's scenes name.

    This is what makes a character look like the SAME person from scene to
    scene and across videos: each of that character's keyframes is generated
    from one appearance description and one fixed seed. The schema already
    carried `descriptor` and `seed`; nothing was reading them, so
    `scene.character_reference` — which `executors.execute_keyframe` looks for
    and `fal_adapter` folds into the image prompt — was always empty.

    Best-effort: a lookup failure degrades to unreferenced characters (the
    render still succeeds, it just loses consistency) rather than failing the job.
    """
    ids = {r.get("character_id") for r in scene_rows if r.get("character_id")}
    if not ids:
        return {}
    try:
        rows = (
            sb.table("characters")
            .select("id, name, role, ethnicity, gender, descriptor, seed, voice_id")
            .in_("id", list(ids))
            .execute()
            .data
        ) or []
    except Exception:
        return {}

    refs: dict = {}
    for c in rows:
        d = c.get("descriptor") or {}
        parts = [
            c.get("name"),
            c.get("gender"),
            c.get("ethnicity"),
            d.get("identity"),
            d.get("face"),
            d.get("hair"),
            d.get("clothes"),
            d.get("style"),
        ]
        reference = ", ".join(str(p).strip() for p in parts if p and str(p).strip())
        # A character with a voice but no usable description still matters —
        # they can speak even if their look falls back to the scene prompt.
        if reference or c.get("voice_id"):
            refs[c["id"]] = {
                "reference": reference or None,
                "seed": c.get("seed"),
                "voice_id": c.get("voice_id"),
            }
    return refs


def _scene_from_row(row: dict, char_refs: dict | None = None) -> _NS:
    prompt = row.get("prompt") or {}
    prompt_ns = _prompt_ns(prompt)

    # Attach the character's appearance + seed so every keyframe of that
    # character is generated from the same anchor. The seed rides on the prompt
    # because that is where fal_adapter.generate_image reads it from.
    ref = (char_refs or {}).get(row.get("character_id")) or {}
    if ref.get("seed") is not None:
        try:
            prompt_ns.seed = int(ref["seed"])
        except (TypeError, ValueError):
            pass

    return _NS(
        id=row.get("id"),
        character_reference=ref.get("reference"),
        character_voice_id=ref.get("voice_id"),
        seq=row.get("seq") or 0,
        start_sec=row.get("start_sec") or 0.0,
        end_sec=row.get("end_sec") or 0.0,
        narration=row.get("narration") or "",
        subtitle=row.get("subtitle") or "",
        importance=row.get("importance"),
        importance_score=row.get("importance_score"),
        new_asset_required=row.get("new_asset_required"),
        existing_asset_allowed=row.get("existing_asset_allowed"),
        animation_required=bool(prompt.get("animation_required")),
        recommended_quality=row.get("recommended_quality") or "Medium",
        motion_type=row.get("motion_type") or "static",
        animate=row.get("animate"),
        asset_query=prompt.get("asset_query", ""),
        character_id=row.get("character_id"),
        prompt=prompt_ns,
    )


def _story_from_rows(
    story_row: dict, scene_rows: list[dict], char_refs: dict | None = None
) -> _NS:
    beat_sheet = story_row.get("beat_sheet") or {}
    scenes = sorted(
        (_scene_from_row(r, char_refs) for r in scene_rows), key=lambda s: s.seq
    )
    seo = beat_sheet.get("seo") or {"title": story_row.get("topic") or "", "description": "", "tags": []}
    return _NS(
        id=story_row.get("id"),
        project_id=story_row.get("project_id"),
        title=story_row.get("topic") or "",
        logline=story_row.get("logline") or "",
        moral=story_row.get("moral") or "",
        language=beat_sheet.get("language", "en"),
        total_seconds=story_row.get("duration_seconds") or 0.0,
        characters_used=beat_sheet.get("characters_used", []),
        scenes=scenes,
        thumbnail_prompt=beat_sheet.get("thumbnail_prompt", ""),
        seo=_NS(**seo),
    )


# --------------------------------------------------------------------------
# Supabase bookkeeping helpers -- all best-effort: a bookkeeping hiccup must
# never take down an otherwise-successful local render.
# --------------------------------------------------------------------------

def _find_run_id(sb, story_id: str) -> str | None:
    try:
        rows = (sb.table("pipeline_runs").select("id").eq("story_id", story_id)
                .order("started_at", desc=True).limit(1).execute().data)
    except Exception:
        return None
    return rows[0]["id"] if rows else None


def _mark_stage(sb, run_id, stage: str, cost_usd: float = 0.0,
                 duration_ms: int | None = None, output: dict | None = None) -> None:
    if sb is None or run_id is None:
        return
    try:
        sb.table("pipeline_stages").update({
            "status": "done", "cost_usd": cost_usd,
            "duration_ms": duration_ms, "output": output or {},
        }).eq("run_id", run_id).eq("stage", stage).execute()
    except Exception:
        pass


def _finish_run(sb, run_id, total_cost_usd: float) -> None:
    if sb is None or run_id is None:
        return
    try:
        sb.table("pipeline_runs").update({
            "status": "done", "current_stage": "publish", "total_cost_usd": total_cost_usd,
        }).eq("id", run_id).execute()
    except Exception:
        pass


def _resolve_reusable_path(sb, asset_id) -> Path | None:
    """A reuse_asset/reuse_cache plan points at an existing `assets` row --
    if it points at a real local file, reuse it instead of re-generating.
    Falls back to None (caller generates fresh) for mock:// placeholders or
    rows that no longer resolve to a file on disk."""
    if sb is None or not asset_id:
        return None
    try:
        rows = sb.table("assets").select("storage_path").eq("id", asset_id).limit(1).execute().data
    except Exception:
        return None
    if not rows:
        return None
    path = rows[0].get("storage_path")
    if path and Path(path).is_file():
        return Path(path)
    return None


def _insert_asset(sb, project_id, story_id, scene_id, kind: str, path,
                   cost_usd: float = 0.0, meta: dict | None = None) -> None:
    if sb is None:
        return
    try:
        sb.table("assets").insert({
            "project_id": project_id, "story_id": story_id, "scene_id": scene_id,
            "kind": kind, "storage_path": str(path), "meta": meta or {}, "cost_usd": cost_usd,
        }).execute()
    except Exception:
        pass


# --------------------------------------------------------------------------
# main entry point
# --------------------------------------------------------------------------

def _motion_live(live: bool, plan: dict) -> bool:
    """AI image-to-video (a paid fal call) runs only when the run is live AND
    the budget-aware plan approved AI motion for this scene. `plan_scene` sets
    motion_action='ai_animation' only for HIGH-importance scenes the
    CostGovernor can still afford; every other case is 'local_ffmpeg' (free),
    so gating on it enforces the per-video budget on the expensive step."""
    return bool(live) and plan.get("motion_action") == "ai_animation"


def run_pipeline(story_id, live: bool = False, budget: float = 1.55,
                  project_id: str | None = None, out_dir: str | Path | None = None,
                  music_path: str | Path | None = None) -> dict:
    """Run the full pipeline for one story.

    story_id: either a Supabase story UUID (str) -- story+scenes are loaded
    from the DB -- or a StoryDoc / story-shaped object, used directly
    (no Supabase required; asset/prompt reuse degrades to a local no-op).

    live: forwarded to every executor. False (default) => $0, no paid API
    calls anywhere in this call graph.
    """
    sb = None
    run_id = None

    if isinstance(story_id, str):
        sb = get_supabase()
        story_row = sb.table("stories").select("*").eq("id", story_id).single().execute().data
        scene_rows = (sb.table("scenes").select("*").eq("story_id", story_id)
                      .order("seq").execute().data or [])
        char_refs = _load_character_refs(sb, scene_rows)
        story = _story_from_rows(story_row, scene_rows, char_refs)
        sid = story_id
        run_id = _find_run_id(sb, sid)
    else:
        story = story_id
        sid = getattr(story, "id", None)

    proj_id = project_id or getattr(story, "project_id", None) or "mock-project"

    routing = DEFAULT_ROUTING
    if sb is not None:
        try:
            routing = load_model_routing(proj_id)
        except Exception:
            routing = DEFAULT_ROUTING

    project = {"id": proj_id, "model_routing": routing}
    governor = CostGovernor(budget)
    lib = asset_library if sb is not None else _NullAssetLibrary()
    cache = prompt_cache if sb is not None else _NullPromptCache()

    out_dir = Path(out_dir) if out_dir else Path(get_settings().storage_dir) / "_render_test" / (sid or "local")
    out_dir.mkdir(parents=True, exist_ok=True)

    scene_clips: list[Path] = []
    per_scene: list[dict] = []
    keyframe_ms = motion_ms = 0

    for scene in story.scenes:
        seq = int(scene.seq or 0)
        plan = plan_scene(scene, project, lib, cache, governor)

        t0 = time.monotonic()
        keyframe_path = out_dir / f"scene_{seq:02d}_keyframe.png"
        reused = None
        if plan["image_action"] in ("reuse_asset", "reuse_cache"):
            reused = _resolve_reusable_path(sb, plan.get("image_asset_id"))
        if reused is not None:
            keyframe_path = reused
        else:
            executors.execute_keyframe(scene, keyframe_path, live=live, routing=routing)
            if plan["image_action"] == "generate":
                # cost_usd on the row is what was *actually* spent producing
                # this asset instance: the decision engine's estimate in
                # live mode, $0 in mock (no paid call was ever made) --
                # plan["image_cost"] itself stays the planning-time estimate
                # either way (see per_scene["planned_cost_usd"] below).
                _insert_asset(sb, proj_id, sid, getattr(scene, "id", None), "keyframe",
                               keyframe_path, cost_usd=plan["image_cost"] if live else 0.0,
                               meta={"model": plan["image_model"]})
        keyframe_ms += int((time.monotonic() - t0) * 1000)

        seconds = max(float(scene.end_sec) - float(scene.start_sec), 1.0)

        t0 = time.monotonic()
        motion_path = out_dir / f"scene_{seq:02d}_motion.mp4"
        executors.execute_motion(scene, keyframe_path, motion_path,
                                  live=_motion_live(live, plan),
                                  routing=routing, seconds=seconds)
        motion_ms += int((time.monotonic() - t0) * 1000)
        if plan["motion_action"] == "ai_animation":
            _insert_asset(sb, proj_id, sid, getattr(scene, "id", None), "motion",
                           motion_path, cost_usd=plan["motion_cost"] if live else 0.0,
                           meta={"model": plan["motion_model"]})
        scene_clips.append(motion_path)
        per_scene.append({
            "seq": seq, "keyframe": str(keyframe_path), "motion": str(motion_path),
            "plan": plan, "planned_cost_usd": plan["image_cost"] + plan["motion_cost"],
        })

    # Subtitle cue timings come straight from each scene's own start/end
    # offsets (already contiguous by StoryDoc validation).
    subtitles = [(float(s.start_sec), float(s.end_sec), s.subtitle) for s in story.scenes]

    _mark_stage(sb, run_id, "keyframe_images", duration_ms=keyframe_ms)
    _mark_stage(sb, run_id, "motion_clips", duration_ms=motion_ms)

    narration = " ".join(s.narration for s in story.scenes)
    # One segment per scene, tagged with that scene's character voice. When the
    # story has more than one distinct voice, execute_voice speaks each scene in
    # its character's voice; with one (or none) it takes the original
    # single-call path, so nothing changes for workspaces without character
    # voices. Scenes built from an in-memory StoryDoc have no character voice,
    # so they always take that path too.
    voice_segments = [
        (s.narration, getattr(s, "character_voice_id", None)) for s in story.scenes
    ]
    voice_path = out_dir / "voice.m4a"
    t0 = time.monotonic()
    _, voice_duration = executors.execute_voice(
        narration, voice_path, live=live, segments=voice_segments
    )
    _mark_stage(sb, run_id, "voice", duration_ms=int((time.monotonic() - t0) * 1000),
                output={"duration_sec": voice_duration})
    _insert_asset(sb, proj_id, sid, None, "audio", voice_path,
                   meta={"duration_sec": voice_duration})

    final_path = out_dir / "final.mp4"
    t0 = time.monotonic()
    # `music_path` is optional: render_video ducks it under the narration
    # (0.15 vs 1.0) when present, and mixes narration alone when it is None.
    render.render_video(
        scene_clips, voice_path, final_path, subtitles=subtitles, music_path=music_path
    )
    _mark_stage(sb, run_id, "render", duration_ms=int((time.monotonic() - t0) * 1000))
    _insert_asset(sb, proj_id, sid, None, "render", final_path)

    thumbnail_path = out_dir / "thumbnail.png"
    executors.execute_thumbnail(story, thumbnail_path, live=live, routing=routing)
    _mark_stage(sb, run_id, "thumbnail")
    _insert_asset(sb, proj_id, sid, None, "thumbnail", thumbnail_path)

    metadata = executors.execute_metadata(story, live=live)
    _mark_stage(sb, run_id, "metadata", output=metadata)

    # "Cost" is what was actually spent this run: $0 in mock mode (no paid
    # API was ever called), governor.spent in live mode. governor.spent
    # itself is still populated in mock mode -- it is the decision engine's
    # *planned* cost (what this run would have cost if live), used for
    # per-scene budget-aware routing regardless of live/mock.
    actual_cost = governor.spent if live else 0.0
    _finish_run(sb, run_id, actual_cost)

    return {
        "story_id": sid,
        "final_path": str(final_path),
        "thumbnail": str(thumbnail_path),
        "voice_path": str(voice_path),
        "voice_duration_sec": voice_duration,
        "metadata": metadata,
        "cost": actual_cost,
        "planned_cost_usd": governor.spent,
        "budget_usd": governor.budget,
        "per_scene": per_scene,
    }
