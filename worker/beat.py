from celery.schedules import crontab

# All times are interpreted in celery_app.conf.timezone (America/New_York).
beat_schedule = {
    "generate-daily": {
        "task": "worker.tasks.pipeline.start_daily_generation",
        "schedule": crontab(hour=3, minute=0),
    },
    "publish-daily": {
        "task": "worker.tasks.publish.publish_ready_videos",
        "schedule": crontab(hour=9, minute=0),
    },
    "analytics-daily": {
        "task": "worker.tasks.analytics.snapshot_analytics",
        "schedule": crontab(hour=12, minute=0),
    },
}
