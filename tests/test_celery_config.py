def test_beat_schedule_times():
    from worker.beat import beat_schedule
    gen = beat_schedule["generate-daily"]["schedule"]
    pub = beat_schedule["publish-daily"]["schedule"]
    assert gen.hour == {3} and gen.minute == {0}
    assert pub.hour == {9} and pub.minute == {0}
    assert "analytics-daily" in beat_schedule


def test_celery_timezone_is_eastern():
    from worker.celery_app import celery_app
    assert celery_app.conf.timezone == "America/New_York"
    assert celery_app.conf.beat_schedule["generate-daily"]


def test_pipeline_task_marks_failure(monkeypatch):
    import worker.tasks.base as base
    calls = []
    monkeypatch.setattr(base, "set_video_status", lambda vid, st: calls.append(("status", vid, st)))
    monkeypatch.setattr(base, "record_job",
                        lambda vid, t, st, error=None: calls.append(("job", vid, t, st)))
    t = base.PipelineTask()
    t.name = "worker.tasks.script.script"
    t.on_failure(RuntimeError("boom"), "tid", ("vid-9",), {}, None)
    assert ("status", "vid-9", "failed") in calls
    assert ("job", "vid-9", "worker.tasks.script.script", "dead") in calls
