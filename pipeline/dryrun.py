"""End-to-end $0 dry run of the Phase-1 short-form pipeline:

    generate_story(mock=True) -> persist_story(...) -> plan_scene(...) per scene
    -> print a cost report

Writes a real sample story + scenes into Supabase (free, service-role) but
makes ZERO calls to fal.ai / OpenAI / ElevenLabs -- every generative call is
mocked/dry. Run with:

    .venv\\Scripts\\python -m pipeline.dryrun
"""
import sys

from app.supabase_client import get_supabase
from pipeline import asset_library, prompt_cache
from pipeline.cost_governor import CostGovernor
from pipeline.decision import plan_scene
from pipeline.model_routing import DEFAULT_ROUTING, load_model_routing
from pipeline.persist import persist_story
from pipeline.story import generate_story

DEFAULT_PROJECT_ID = "c6aff9d8-49ba-46a8-b243-46185bc3bf5d"


def _ensure_utf8_stdout() -> None:
    """Windows consoles often default to cp1252, which can't print
    Devanagari narration. Reconfigure stdout to UTF-8 when possible so the
    cost report prints cleanly regardless of the host terminal's codepage."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name)
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass


def run_dry(project_id: str = DEFAULT_PROJECT_ID) -> dict:
    _ensure_utf8_stdout()
    story = generate_story(project_id, mock=True)
    story_id = persist_story(story, project_id)

    sb = get_supabase()
    project_row = (sb.table("projects").select("*").eq("id", project_id)
                   .limit(1).execute().data or [{}])
    project_row = project_row[0] if project_row else {}
    budget = float(project_row.get("per_video_budget_usd") or 1.55)

    try:
        routing = load_model_routing(project_id)
    except Exception:
        routing = DEFAULT_ROUTING

    project = {"id": project_id, "model_routing": routing}
    governor = CostGovernor(budget)

    lines = []
    for scene in story.scenes:
        plan = plan_scene(scene.model_dump(), project, asset_library, prompt_cache, governor)
        scene_total = plan["image_cost"] + plan["motion_cost"]
        lines.append(
            "Scene {seq:>2} [{importance:6}] "
            "image={image_action:<11} (${image_cost:.3f} {image_model}) | "
            "motion={motion_action:<12} (${motion_cost:.3f} {motion_type})  "
            "-> ${scene_total:.3f}".format(scene_total=scene_total, **{
                **plan,
                "image_model": plan["image_model"] or "-",
            })
        )

    total = governor.spent

    print("=== Amber Light Stories -- Phase 1 Dry-Run Cost Report ===")
    print(f"Story: {story.title}  ({story.total_seconds:.0f}s, {len(story.scenes)} scenes)")
    print(f"story_id = {story_id}")
    print("-" * 88)
    for line in lines:
        print(line)
    print("-" * 88)
    print(f"TOTAL estimated cost: ${total:.3f}   Budget: ${governor.budget:.2f}   "
          f"Remaining: ${governor.remaining():.3f}")
    if total > governor.budget + 1e-9:
        raise RuntimeError(f"Dry-run exceeded budget: ${total:.3f} > ${governor.budget:.2f}")
    print("Zero paid API calls made: generate_story(mock=True), fal_adapter dry=True, "
          "no ElevenLabs/OpenAI/fal.ai network calls.")

    return {"story_id": story_id, "total_cost_usd": total, "budget_usd": governor.budget}


if __name__ == "__main__":
    run_dry()
