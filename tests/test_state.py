from tests.conftest import FakeSupabase


def test_set_video_status_updates_row(monkeypatch):
    fake = FakeSupabase()
    import app.state as state
    monkeypatch.setattr(state, "get_supabase", lambda: fake)
    state.set_video_status("vid-1", "scripting", topic="A tale")
    q = fake.queries["videos"][0]
    assert q.updated["status"] == "scripting"
    assert q.updated["topic"] == "A tale"
    assert "updated_at" in q.updated
    assert ("id", "vid-1") in q.eqs


def test_record_job_inserts(monkeypatch):
    fake = FakeSupabase()
    import app.state as state
    monkeypatch.setattr(state, "get_supabase", lambda: fake)
    state.record_job("vid-1", "script", "done")
    q = fake.queries["jobs"][0]
    assert q.inserted == {
        "video_id": "vid-1", "type": "script", "status": "done", "last_error": None,
    }


def test_log_usage_inserts(monkeypatch):
    fake = FakeSupabase()
    import app.usage as usage
    monkeypatch.setattr(usage, "get_supabase", lambda: fake)
    usage.log_usage("openai", "script", 1200, 0.006, "vid-1")
    q = fake.queries["api_usage"][0]
    assert q.inserted["provider"] == "openai"
    assert q.inserted["units"] == 1200
    assert q.inserted["cost_usd"] == 0.006
    assert q.inserted["video_id"] == "vid-1"
