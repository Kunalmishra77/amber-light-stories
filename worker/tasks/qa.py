from app.state import record_job, set_video_status
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.qa.qa_hold")
def qa_hold(self, video_id: str) -> str:
    # Human gate: video waits here until approved via POST /videos/{id}/approve.
    set_video_status(video_id, "qa")
    record_job(video_id, "qa_hold", "done")
    return video_id
