from celery import Task

from app.state import record_job, set_video_status


class PipelineTask(Task):
    """Base for pipeline steps: retry x3 with backoff, then mark video failed."""

    autoretry_for = (Exception,)
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True
    max_retries = 3

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        video_id = args[0] if args else kwargs.get("video_id")
        if video_id:
            set_video_status(video_id, "failed")
            record_job(video_id, self.name, "dead", error=str(exc))
