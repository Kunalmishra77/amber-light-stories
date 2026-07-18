from fastapi.testclient import TestClient

from tests.conftest import FakeSupabase


def make_client(monkeypatch, table_data):
    import app.routers.videos as videos_mod
    fake = FakeSupabase(table_data)
    monkeypatch.setattr(videos_mod, "get_supabase", lambda: fake)
    from app.main import app
    return TestClient(app), fake


def test_health(monkeypatch):
    client, _ = make_client(monkeypatch, {})
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_list_videos_filters_by_status(monkeypatch):
    rows = [{"id": "v1", "status": "qa", "topic": "t"}]
    client, fake = make_client(monkeypatch, {"videos": rows})
    r = client.get("/videos", params={"status": "qa"})
    assert r.status_code == 200
    assert r.json() == rows
    assert ("status", "qa") in fake.queries["videos"][0].eqs


def test_approve_moves_qa_to_ready(monkeypatch):
    rows = [{"id": "v1", "status": "ready"}]
    client, fake = make_client(monkeypatch, {"videos": rows})
    r = client.post("/videos/v1/approve")
    assert r.status_code == 200
    q = fake.queries["videos"][0]
    assert q.updated["status"] == "ready"
    assert ("id", "v1") in q.eqs and ("status", "qa") in q.eqs


def test_approve_404_when_not_in_qa(monkeypatch):
    client, _ = make_client(monkeypatch, {"videos": []})
    r = client.post("/videos/v1/approve")
    assert r.status_code == 404


def test_reject_sets_failed(monkeypatch):
    rows = [{"id": "v1", "status": "failed"}]
    client, fake = make_client(monkeypatch, {"videos": rows})
    r = client.post("/videos/v1/reject", json={"reason": "bad audio"})
    assert r.status_code == 200
    assert fake.queries["videos"][0].updated["status"] == "failed"
