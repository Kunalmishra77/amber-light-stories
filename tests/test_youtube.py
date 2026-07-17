from unittest.mock import MagicMock

from tests.conftest import FakeSupabase


def test_upload_skipped_when_already_uploaded(monkeypatch):
    import apis.youtube as yt
    fake = FakeSupabase({"videos": {"yt_video_id": "abc123"}})
    monkeypatch.setattr(yt, "get_supabase", lambda: fake)
    build_mock = MagicMock()
    monkeypatch.setattr(yt, "build", build_mock)

    result = yt.upload_video("vid-1", "storage/vid-1/final.mp4", "T", "D", ["t"],
                             "2026-07-17T13:00:00Z")
    assert result == "abc123"
    build_mock.assert_not_called()  # idempotency: no API call


def test_upload_inserts_and_marks_scheduled(monkeypatch):
    import apis.youtube as yt
    fake = FakeSupabase({"videos": {"yt_video_id": None}})
    monkeypatch.setattr(yt, "get_supabase", lambda: fake)
    monkeypatch.setattr(yt, "get_credentials", lambda: MagicMock())
    monkeypatch.setattr(yt, "MediaFileUpload", MagicMock())
    monkeypatch.setattr(yt, "log_usage", lambda *a, **k: None)

    service = MagicMock()
    service.videos().insert().execute.return_value = {"id": "newyt42"}
    monkeypatch.setattr(yt, "build", lambda *a, **k: service)

    result = yt.upload_video("vid-1", "storage/vid-1/final.mp4", "Title", "Desc",
                             ["tag"], "2026-07-17T13:00:00Z")
    assert result == "newyt42"
    # second query on videos table is the update
    update_q = fake.queries["videos"][1]
    assert update_q.updated["yt_video_id"] == "newyt42"
    assert update_q.updated["status"] == "scheduled"

    # body must be private, scheduled, and not made for kids
    _, kwargs = service.videos().insert.call_args
    body = kwargs["body"]
    assert body["status"]["privacyStatus"] == "private"
    assert body["status"]["publishAt"] == "2026-07-17T13:00:00Z"
    assert body["status"]["selfDeclaredMadeForKids"] is False
