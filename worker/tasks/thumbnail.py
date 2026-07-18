from app.config import storage_path
from app.state import record_job
from app.supabase_client import get_supabase
from media.render import make_thumbnail
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.thumbnail.thumbnail")
def thumbnail(self, video_id: str) -> str:
    sb = get_supabase()
    video = sb.table("videos").select("topic").eq("id", video_id).single().execute().data
    make_thumbnail(video["topic"], storage_path(video_id) / "thumb.png")
    record_job(video_id, "thumbnail", "done")
    return video_id
