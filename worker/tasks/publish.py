from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.config import get_settings, storage_path
from app.state import record_job
from app.supabase_client import get_supabase
from apis.youtube import upload_video
from worker.celery_app import celery_app
from worker.tasks.notify import notify_published


def next_publish_iso() -> str:
    """Today at PUBLISH_HOUR ET, as UTC ISO-8601. +5 min if already past."""
    s = get_settings()
    tz = ZoneInfo(s.publish_timezone)
    now_local = datetime.now(tz)
    target = now_local.replace(hour=s.publish_hour, minute=0, second=0, microsecond=0)
    if target <= now_local:
        target = now_local + timedelta(minutes=5)
    return target.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@celery_app.task(name="worker.tasks.publish.publish_ready_videos")
def publish_ready_videos():
    sb = get_supabase()
    ready = sb.table("videos").select("*").eq("status", "ready").execute().data or []
    for row in ready:
        try:
            meta_rows = (sb.table("metadata").select("*").eq("video_id", row["id"])
                         .order("created_at", desc=True).limit(1).execute().data)
            m = meta_rows[0] if meta_rows else {}
            yt_id = upload_video(
                row["id"], row["storage_key"],
                m.get("title") or row["topic"],
                m.get("description") or "",
                m.get("tags") or [],
                next_publish_iso(),
                thumbnail_path=str(storage_path(row["id"]) / "thumb.png"),
            )
            notify_published.delay(row["id"], yt_id)
        except Exception as exc:
            record_job(row["id"], "publish", "failed", error=str(exc))
            continue
