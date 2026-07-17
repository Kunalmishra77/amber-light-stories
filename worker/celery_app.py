from celery import Celery

from app.config import get_settings
from worker.beat import beat_schedule

_settings = get_settings()

celery_app = Celery(
    "amber_light",
    broker=_settings.redis_url,
    backend=_settings.redis_url,
    include=[
        "worker.tasks.pipeline",
        "worker.tasks.research",
        "worker.tasks.script",
        "worker.tasks.voice",
        "worker.tasks.images",
        "worker.tasks.assemble",
        "worker.tasks.thumbnail",
        "worker.tasks.seo",
        "worker.tasks.qa",
        "worker.tasks.publish",
        "worker.tasks.notify",
        "worker.tasks.analytics",
    ],
)
celery_app.conf.timezone = _settings.publish_timezone
celery_app.conf.beat_schedule = beat_schedule
celery_app.conf.task_acks_late = True
celery_app.conf.worker_prefetch_multiplier = 1
