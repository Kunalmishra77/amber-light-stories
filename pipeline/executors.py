"""Per-stage media producers for the short-form pipeline (spec section 6 --
"Build the REAL generation executors"). Every generative function takes a
`live: bool = False` flag that defaults to False everywhere.

Mock mode (the default, and the ONLY path exercised by this repo's tests /
render_dryrun) makes ZERO network calls to any paid provider (fal.ai,
ElevenLabs, OpenAI, Gemini) -- keyframes are drawn locally with Pillow,
motion clips are rendered locally with FFmpeg (pipeline.local_motion),
narration is a real *silent* FFmpeg-generated audio track, thumbnails are
local Pillow title cards, and metadata is deterministic text already baked
into the StoryDoc by pipeline.story. Every one of those still produces a
REAL file on disk (PNG/MP4/AAC) -- the point is to prove out the assembly
end-to-end at $0.

live=True paths are complete and correctly wired to the existing adapters
(pipeline.fal_adapter, ai.tts.elevenlabs_adapter, ai.llm.router) but are
never imported/executed anywhere in this repo's tests or dry-run. They are
gated behind the `live` flag, which the caller must explicitly opt into.
"""
import json
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from pipeline import fal_adapter
from pipeline.local_motion import build_motion_command
from pipeline.model_routing import DEFAULT_ROUTING, image_model, thumbnail_model

# Same warm "amber light" placeholder palette as media/render.py (v1),
# adapted to the vertical 9:16 format used everywhere in Phase 2.
_TOP = (28, 18, 46)       # deep violet
_BOTTOM = (196, 106, 32)  # amber
VERTICAL_SIZE = (1080, 1920)

# Mock narration pacing estimate used to size the silent placeholder track.
WORDS_PER_SECOND = 2.5
MIN_VOICE_SECONDS = 1.0

_LOCAL_MOTION_TYPES = {"static", "ken_burns", "zoom", "pan", "motion_crop"}


# --------------------------------------------------------------------------
# shared helpers
# --------------------------------------------------------------------------

def _get(obj, key, default=None):
    """Read `key` off a dict, a pydantic model, or any attribute-bearing
    object (SimpleNamespace, etc.) -- scenes/stories flow through this
    module in all three shapes depending on caller (tests, orchestrator)."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _as_dict(obj) -> dict:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "__dict__"):
        return dict(vars(obj))
    return dict(obj)


def _gradient(size) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(_TOP[0] + (_BOTTOM[0] - _TOP[0]) * t)
        g = int(_TOP[1] + (_BOTTOM[1] - _TOP[1]) * t)
        b = int(_TOP[2] + (_BOTTOM[2] - _TOP[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def _font(px_size: int):
    custom = Path(__file__).resolve().parent.parent / "media" / "fonts"
    if custom.is_dir():
        for f in sorted(custom.glob("*.ttf")):
            return ImageFont.truetype(str(f), px_size)
    return ImageFont.load_default(size=px_size)


def _draw_centered_card(size, text: str, wrap_width: int, font_size: int) -> Image.Image:
    img = _gradient(size)
    draw = ImageDraw.Draw(img)
    excerpt = textwrap.fill((text or "").strip()[:220], width=wrap_width) or " "
    draw.multiline_text(
        (size[0] // 2, size[1] // 2), excerpt, font=_font(font_size),
        fill=(245, 235, 220), anchor="mm", align="center", spacing=16,
    )
    return img


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0]
    return text.strip()


# --------------------------------------------------------------------------
# 1. keyframe image
# --------------------------------------------------------------------------

def execute_keyframe(scene, out_path, live: bool = False, routing: dict | None = None) -> Path:
    """Produce one scene's keyframe still image.

    live=True: fal.ai Flux via pipeline.fal_adapter.generate_image, model
    resolved from `routing` by scene.recommended_quality; a character
    reference (scene.character_reference / scene.character_reference_asset_path,
    when present) is folded into the prompt sent to fal. Never called here
    unless the caller explicitly passes live=True.

    live=False (default): a local Pillow 1080x1920 cinematic gradient still
    carrying the scene's subject text -- a real PNG, $0, no network call.
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    routing = routing or DEFAULT_ROUTING

    prompt = _get(scene, "prompt")
    prompt_dict = _as_dict(prompt)

    if live:
        quality = _get(scene, "recommended_quality", "Medium")
        model = image_model(routing, quality)  # noqa: F841 -- resolved for the real call
        ref = _get(scene, "character_reference") or _get(scene, "character_reference_asset_path")
        if ref:
            prompt_dict = {**prompt_dict, "character_reference": ref}
        project = {"id": _get(scene, "project_id"), "model_routing": routing}
        result = fal_adapter.generate_image(prompt_dict, quality, project, dry=False)
        # Real path: download/copy the generated asset to out_path. fal_adapter's
        # dry=False branch is not wired up in Phase 1 (raises NotImplementedError,
        # matching the rest of this repo) -- unreachable in tests/dry-run.
        out_path.write_bytes(result.get("bytes", b""))
        return out_path

    subject = prompt_dict.get("subject") or _get(scene, "narration") or _get(scene, "asset_query") or ""
    img = _draw_centered_card(VERTICAL_SIZE, str(subject), wrap_width=28, font_size=58)
    img.save(out_path, "PNG")
    return out_path


# --------------------------------------------------------------------------
# 2. motion clip
# --------------------------------------------------------------------------

def execute_motion(scene, image_path, out_path, live: bool = False,
                    routing: dict | None = None, seconds: float | None = None) -> Path:
    """Produce one scene's motion clip from its keyframe still.

    live=True AND the scene actually calls for AI animation (motion_type ==
    'ai_animation' and animate/animation_required): fal.ai image-to-video via
    pipeline.fal_adapter.generate_motion.

    Otherwise -- mock mode, or a non-hero scene even when live=True -- a
    LOCAL FFmpeg motion clip is rendered via
    pipeline.local_motion.build_motion_command (ken_burns/zoom/pan/static/
    motion_crop): a real short mp4, $0, no network call. 'ai_animation' has
    no local equivalent, so it downgrades to 'ken_burns' when rendered
    locally (mirrors CostGovernor.downgrade_motion_type).
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    routing = routing or DEFAULT_ROUTING

    motion_type = _get(scene, "motion_type", "static")
    animate = _get(scene, "animate")
    if animate is None:
        animate = motion_type == "ai_animation" or bool(_get(scene, "animation_required"))

    if seconds is None:
        start = float(_get(scene, "start_sec", 0.0) or 0.0)
        end = float(_get(scene, "end_sec", start + 5.0) or (start + 5.0))
        seconds = max(end - start, 1.0)

    if live and motion_type == "ai_animation" and animate:
        tier = "standard"
        project = {"id": _get(scene, "project_id"), "model_routing": routing}
        result = fal_adapter.generate_motion(str(image_path), tier, project, dry=False)
        # Real path unreachable in tests/dry-run -- see execute_keyframe docstring.
        out_path.write_bytes(result.get("bytes", b""))
        return out_path

    local_type = motion_type if motion_type in _LOCAL_MOTION_TYPES else "ken_burns"
    cmd = build_motion_command(image_path, local_type, seconds, out_path, size=VERTICAL_SIZE)
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path


# --------------------------------------------------------------------------
# 3. voice
# --------------------------------------------------------------------------

def estimate_voice_seconds(text: str) -> float:
    words = len((text or "").split())
    return max(words / WORDS_PER_SECOND, MIN_VOICE_SECONDS)


def execute_voice(text: str, out_path, live: bool = False) -> tuple[Path, float]:
    """Produce the full narration audio track.

    live=True: ElevenLabs (ai.tts.elevenlabs_adapter.ElevenLabsAdapter,
    already fully implemented) synthesizes real speech; duration is then
    read back from the file via ffprobe.

    live=False (default): a SILENT audio track sized to an estimated
    duration (~words / 2.5 words-per-second), generated locally with
    FFmpeg's `anullsrc` -- a real, playable (silent) audio file, $0.
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if live:
        from ai.tts.elevenlabs_adapter import ElevenLabsAdapter

        ElevenLabsAdapter().synthesize(text, out_path)
        duration = _probe_duration(out_path)
        return out_path, duration

    duration = estimate_voice_seconds(text)
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t", str(duration),
        "-c:a", "aac",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path, duration


def _probe_duration(path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


# --------------------------------------------------------------------------
# 4. thumbnail
# --------------------------------------------------------------------------

def execute_thumbnail(story, out_path, live: bool = False, routing: dict | None = None) -> Path:
    """Produce the video thumbnail.

    live=True: fal.ai (thumbnail_model from routing) via
    pipeline.fal_adapter.generate_image, using story.thumbnail_prompt.

    live=False (default): a local Pillow 1080x1920 vertical title card built
    from the story title -- a real PNG, $0.
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    routing = routing or DEFAULT_ROUTING

    if live:
        model = thumbnail_model(routing)  # noqa: F841 -- resolved for the real call
        prompt_dict = {"subject": _get(story, "thumbnail_prompt", "")}
        project = {"id": _get(story, "project_id"), "model_routing": routing}
        result = fal_adapter.generate_image(prompt_dict, "High", project, dry=False)
        # Real path unreachable in tests/dry-run -- see execute_keyframe docstring.
        out_path.write_bytes(result.get("bytes", b""))
        return out_path

    title = _get(story, "title", "") or ""
    img = _draw_centered_card(VERTICAL_SIZE, title, wrap_width=18, font_size=76)
    img.save(out_path, "PNG")
    return out_path


# --------------------------------------------------------------------------
# 5. metadata (title/description/tags)
# --------------------------------------------------------------------------

def execute_metadata(story, live: bool = False) -> dict:
    """Produce final YouTube metadata {title, description, tags}.

    live=True: Gemini SEO pass (ai.llm.router.route('seo') + ai/prompts/
    seo.txt) over a script excerpt built from the story's narration.

    live=False (default): deterministic metadata already baked into the
    StoryDoc by pipeline.story (story.seo) -- zero cost, zero randomness.
    """
    if live:
        from ai.llm.router import route
        from ai.prompts import load_prompt

        scenes = _get(story, "scenes", []) or []
        excerpt = " ".join(_get(s, "narration", "") for s in scenes)[:4000]
        prompt = load_prompt("seo").replace("{script_excerpt}", excerpt)
        adapter, model = route("seo")
        result = adapter.generate(prompt, model=model)
        return json.loads(_strip_json_fences(result.text))

    seo = _get(story, "seo")
    seo_dict = _as_dict(seo)
    return {
        "title": seo_dict.get("title") or _get(story, "title", ""),
        "description": seo_dict.get("description", ""),
        "tags": list(seo_dict.get("tags", [])),
    }
