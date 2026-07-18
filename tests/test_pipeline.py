from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from tests.conftest import FakeSupabase


def test_build_pipeline_order():
    from worker.tasks.pipeline import build_pipeline
    c = build_pipeline("vid-1")
    names = [t.task for t in c.tasks]
    assert names == [
        "worker.tasks.research.research",
        "worker.tasks.script.script",
        "worker.tasks.voice.voice",
        "worker.tasks.images.images",
        "worker.tasks.assemble.assemble",
        "worker.tasks.thumbnail.thumbnail",
        "worker.tasks.seo.seo",
        "worker.tasks.qa.qa_hold",
    ]
    assert all(t.immutable for t in c.tasks)


def test_qa_hold_sets_qa_status(monkeypatch):
    import worker.tasks.qa as mod
    captured = {}
    monkeypatch.setattr(mod, "set_video_status",
                        lambda vid, st, **f: captured.update(vid=vid, status=st))
    monkeypatch.setattr(mod, "record_job", lambda *a, **k: None)
    assert mod.qa_hold.run("vid-1") == "vid-1"
    assert captured["status"] == "qa"


def test_next_publish_iso_is_utc_iso():
    from worker.tasks.publish import next_publish_iso
    iso = next_publish_iso()
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    assert dt.tzinfo is not None
    assert dt > datetime.now(timezone.utc) or abs(
        (dt - datetime.now(timezone.utc)).total_seconds()) < 6 * 3600


def test_publish_ready_uploads_and_notifies(monkeypatch):
    import worker.tasks.publish as mod
    ready = [{"id": "vid-1", "topic": "T", "storage_key": "storage/vid-1/final.mp4"}]
    meta = [{"title": "Great Title", "description": "d", "tags": ["a"]}]
    fake = FakeSupabase({"videos": ready, "metadata": meta})
    monkeypatch.setattr(mod, "get_supabase", lambda: fake)
    uploaded = {}
    monkeypatch.setattr(mod, "upload_video",
                        lambda vid, path, title, desc, tags, pub: uploaded.update(
                            vid=vid, title=title) or "yt99")
    notify_mock = MagicMock()
    monkeypatch.setattr(mod, "notify_published", notify_mock)

    mod.publish_ready_videos.run()
    assert uploaded == {"vid": "vid-1", "title": "Great Title"}
    notify_mock.delay.assert_called_once_with("vid-1", "yt99")


def test_snapshot_analytics_flips_scheduled_and_inserts(monkeypatch):
    import worker.tasks.analytics as mod
    video = {
        "id": "vid-1",
        "yt_video_id": "yt-1",
        "scheduled_at": "2020-01-01T09:00:00Z",
    }
    fake = FakeSupabase({"videos": [video]})
    monkeypatch.setattr(mod, "get_supabase", lambda: fake)
    captured = []
    monkeypatch.setattr(mod, "set_video_status",
                        lambda vid, st, **f: captured.append((vid, st, f)))
    stats = {"views": 5, "watch_hours": 1.0, "avg_view_pct": 50.0, "subs_gained": 2}
    monkeypatch.setattr(mod, "fetch_video_stats", lambda yt_id: stats)

    mod.snapshot_analytics.run()

    assert captured == [("vid-1", "published", {"published_at": "2020-01-01T09:00:00Z"})]
    analytics_inserts = [q.inserted for q in fake.queries["analytics"]]
    assert len(analytics_inserts) == 2
    for inserted in analytics_inserts:
        assert inserted == {"video_id": "vid-1", **stats}


def test_start_daily_generation_creates_row_and_chains(monkeypatch):
    import worker.tasks.pipeline as mod
    fake = FakeSupabase({"videos": [{"id": "new-vid"}]})
    monkeypatch.setattr(mod, "get_supabase", lambda: fake)
    chain_mock = MagicMock()
    monkeypatch.setattr(mod, "build_pipeline", lambda vid: chain_mock)

    mod.start_daily_generation.run()
    ins = fake.queries["videos"][0].inserted
    assert ins["status"] == "planned"
    assert ins["idempotency_key"]
    chain_mock.delay.assert_called_once()
