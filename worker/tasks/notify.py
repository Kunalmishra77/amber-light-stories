from apis.gmail import send_email
from app.state import record_job
from worker.celery_app import celery_app


@celery_app.task(name="worker.tasks.notify.notify_published")
def notify_published(video_id: str, yt_video_id: str):
    url = f"https://youtu.be/{yt_video_id}"
    send_email(
        subject="Amber Light Stories — video scheduled ✅",
        body_text=f"Your video is uploaded and scheduled.\n\nWatch: {url}\n",
    )
    record_job(video_id, "notify", "done")
