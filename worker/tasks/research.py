from app.state import record_job, set_video_status
from app.supabase_client import get_supabase
from apis.trends import get_topic_candidates
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.research.research")
def research(self, video_id: str) -> str:
    used_rows = get_supabase().table("videos").select("topic").execute().data or []
    used = {r.get("topic") for r in used_rows}
    candidates = get_topic_candidates()
    topic = next((t for t in candidates if t not in used), None)
    if topic is None:
        # All evergreen topics used: recycle with a sequel marker.
        topic = f"{candidates[0]} — part {len(used_rows) + 1}"
    set_video_status(video_id, "scripting", topic=topic)
    record_job(video_id, "research", "done")
    return video_id
