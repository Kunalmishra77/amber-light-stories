from app.config import storage_path
from app.state import record_job, set_video_status
from app.supabase_client import get_supabase
from media.render import make_still
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask

MAX_SCENES = 8


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.images.images")
def images(self, video_id: str) -> str:
    set_video_status(video_id, "generating")
    sb = get_supabase()
    scripts = (sb.table("scripts").select("body").eq("video_id", video_id)
               .order("created_at", desc=True).limit(1).execute().data)
    text = scripts[0]["body"]["text"]
    scenes = [p.strip() for p in text.split("\n\n") if p.strip()][:MAX_SCENES]
    out_dir = storage_path(video_id)
    for i, scene in enumerate(scenes):
        make_still(scene, out_dir / f"img_{i:02d}.png")
    record_job(video_id, "images", "done")
    return video_id
