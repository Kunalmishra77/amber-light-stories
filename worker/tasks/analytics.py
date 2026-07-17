from datetime import datetime, timezone

from apis.analytics import fetch_video_stats
from app.state import set_video_status
from app.supabase_client import get_supabase
from worker.celery_app import celery_app


@celery_app.task(name="worker.tasks.analytics.snapshot_analytics")
def snapshot_analytics():
    sb = get_supabase()
    now = datetime.now(timezone.utc)
    for status in ("scheduled", "published"):
        rows = sb.table("videos").select("*").eq("status", status).execute().data or []
        for row in rows:
            if not row.get("yt_video_id"):
                continue
            if status == "scheduled" and row.get("scheduled_at"):
                sched = datetime.fromisoformat(row["scheduled_at"].replace("Z", "+00:00"))
                if sched <= now:
                    set_video_status(row["id"], "published",
                                     published_at=row["scheduled_at"])
            stats = fetch_video_stats(row["yt_video_id"])
            sb.table("analytics").insert({"video_id": row["id"], **stats}).execute()
