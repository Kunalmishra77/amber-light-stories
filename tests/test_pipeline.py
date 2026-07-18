from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from tests.conftest import FakeQuery, FakeSupabase


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
                        lambda vid, path, title, desc, tags, pub, thumbnail_path=None:
                            uploaded.update(vid=vid, title=title) or "yt99")
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


class _SeqVideosSupabase:
    """Fake supabase where the idempotency existence-check (select) returns no
    rows, but the subsequent insert returns a fresh row — mirroring real
    Supabase's insert-returns-row behavior, which the naive shared-list
    FakeSupabase can't model since both queries would share the same data."""

    def __init__(self):
        self.queries = {}

    def table(self, name):
        q = FakeQuery([])
        self.queries.setdefault(name, []).append(q)
        if name == "videos" and len(self.queries[name]) == 2:
            q._data = [{"id": "new-vid"}]
        return q


def test_start_daily_generation_creates_row_and_chains(monkeypatch):
    import worker.tasks.pipeline as mod
    fake = _SeqVideosSupabase()
    monkeypatch.setattr(mod, "get_supabase", lambda: fake)
    captured_vid = {}
    chain_mock = MagicMock()

    def fake_build_pipeline(vid):
        captured_vid["id"] = vid
        return chain_mock

    monkeypatch.setattr(mod, "build_pipeline", fake_build_pipeline)

    mod.start_daily_generation.run()
    ins = fake.queries["videos"][1].inserted
    assert ins["status"] == "planned"
    assert ins["idempotency_key"] == f"daily-{date.today().isoformat()}"
    assert captured_vid["id"] == "new-vid"
    chain_mock.delay.assert_called_once()


def test_start_daily_generation_skips_when_already_exists(monkeypatch):
    import worker.tasks.pipeline as mod
    fake = FakeSupabase({"videos": [{"id": "existing-vid"}]})
    monkeypatch.setattr(mod, "get_supabase", lambda: fake)
    chain_mock = MagicMock()
    build_pipeline_mock = MagicMock(return_value=chain_mock)
    monkeypatch.setattr(mod, "build_pipeline", build_pipeline_mock)

    mod.start_daily_generation.run()
    assert len(fake.queries["videos"]) == 1  # only the existence check, no insert
    build_pipeline_mock.assert_not_called()
    chain_mock.delay.assert_not_called()
