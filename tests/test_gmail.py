import base64
from unittest.mock import MagicMock


def test_send_email_builds_raw_message(monkeypatch):
    import apis.gmail as gm
    monkeypatch.setattr(gm, "get_credentials", lambda: MagicMock())
    service = MagicMock()
    monkeypatch.setattr(gm, "build", lambda *a, **k: service)

    gm.send_email("Published!", "Your video is live", to="me@example.com")

    _, kwargs = service.users().messages().send.call_args
    raw = base64.urlsafe_b64decode(kwargs["body"]["raw"])
    assert b"Published!" in raw
    assert b"me@example.com" in raw


def test_fetch_video_stats_zero_when_empty(monkeypatch):
    import apis.analytics as an
    monkeypatch.setattr(an, "get_credentials", lambda: MagicMock())
    service = MagicMock()
    service.reports().query().execute.return_value = {"rows": []}
    monkeypatch.setattr(an, "build", lambda *a, **k: service)

    stats = an.fetch_video_stats("ytid1")
    assert stats == {"views": 0, "watch_hours": 0.0, "avg_view_pct": 0.0, "subs_gained": 0}
