from datetime import date

from celery import chain

from app.supabase_client import get_supabase
from worker.celery_app import celery_app
from worker.tasks.assemble import assemble
from worker.tasks.images import images
from worker.tasks.qa import qa_hold
from worker.tasks.research import research
from worker.tasks.script import script
from worker.tasks.seo import seo
from worker.tasks.thumbnail import thumbnail
from worker.tasks.voice import voice


def build_pipeline(video_id: str):
    return chain(
        research.si(video_id),
        script.si(video_id),
        voice.si(video_id),
        images.si(video_id),
        assemble.si(video_id),
        thumbnail.si(video_id),
        seo.si(video_id),
        qa_hold.si(video_id),
    )


@celery_app.task(name="worker.tasks.pipeline.start_daily_generation")
def start_daily_generation():
    sb = get_supabase()
    idempotency_key = f"daily-{date.today().isoformat()}"
    existing = (sb.table("videos").select("id")
                .eq("idempotency_key", idempotency_key).execute().data)
    if existing:
        return
    row = sb.table("videos").insert({
        "status": "planned",
        "idempotency_key": idempotency_key,
    }).execute().data[0]
    build_pipeline(row["id"]).delay()
