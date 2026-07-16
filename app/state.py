from datetime import datetime, timezone

from app.supabase_client import get_supabase


def set_video_status(video_id: str, status: str, **fields) -> None:
    payload = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat(), **fields}
    get_supabase().table("videos").update(payload).eq("id", video_id).execute()


def record_job(video_id: str, type_: str, status: str, error: str | None = None) -> None:
    get_supabase().table("jobs").insert(
        {"video_id": video_id, "type": type_, "status": status, "last_error": error}
    ).execute()
