"""End-to-end $0 REAL render of the Phase-2 short-form pipeline:

    (load the seeded story, or generate_story(mock=True) + persist_story
    if none exists yet) -> run_pipeline(story_id, live=False)
    -> a real playable 1080x1920 mp4 at storage/_render_test/final.mp4

Every generative call in this path is mocked (Pillow stills, local FFmpeg
motion, silent FFmpeg narration) -- ZERO calls to fal.ai / ElevenLabs /
OpenAI / Gemini. Run with:

    .venv\\Scripts\\python -X utf8 -m pipeline.render_dryrun
"""
import sys
from pathlib import Path

from app.supabase_client import get_supabase
from pipeline.orchestrator import run_pipeline
from pipeline.persist import persist_story
from pipeline.story import generate_story

DEFAULT_PROJECT_ID = "c6aff9d8-49ba-46a8-b243-46185bc3bf5d"


def _ensure_utf8_stdout() -> None:
    """Windows consoles often default to cp1252, which can't print
    Devanagari/curly-quote narration. Reconfigure stdout to UTF-8 when
    possible so this prints cleanly regardless of host codepage."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name)
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass


def _find_or_seed_story(project_id: str) -> str:
    sb = get_supabase()
    rows = (sb.table("stories").select("id").eq("project_id", project_id)
            .order("created_at", desc=True).limit(1).execute().data)
    if rows:
        return rows[0]["id"]
    story = generate_story(project_id, mock=True)
    return persist_story(story, project_id)


def run_render_dry(project_id: str = DEFAULT_PROJECT_ID) -> dict:
    _ensure_utf8_stdout()
    story_id = _find_or_seed_story(project_id)

    out_dir = Path("storage") / "_render_test"
    result = run_pipeline(story_id, live=False, budget=1.55, project_id=project_id, out_dir=out_dir)

    final_path = Path(result["final_path"])
    size_bytes = final_path.stat().st_size if final_path.is_file() else 0

    print("=== Amber Light Stories -- Phase 2 Render Dry-Run ($0) ===")
    print(f"story_id = {story_id}")
    print(f"final mp4      : {final_path}  ({size_bytes / 1024:.1f} KB)")
    print(f"thumbnail      : {result['thumbnail']}")
    print(f"voice duration : {result['voice_duration_sec']:.2f}s (silent, mock)")
    print(f"metadata title : {result['metadata'].get('title')}")
    print(f"actual cost    : ${result['cost']:.3f}  (planned/live-equivalent: "
          f"${result['planned_cost_usd']:.3f} of ${result['budget_usd']:.2f} budget)")
    print("Zero paid API calls made: fal.ai / ElevenLabs / OpenAI / Gemini were never invoked "
          "(live=False everywhere) -- visuals are local Pillow/FFmpeg placeholders, "
          "narration is a silent FFmpeg track.")

    if not final_path.is_file() or size_bytes == 0:
        raise RuntimeError(f"render_dryrun did not produce a real file at {final_path}")

    return result


if __name__ == "__main__":
    run_render_dry()
