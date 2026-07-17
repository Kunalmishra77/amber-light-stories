import json
from types import SimpleNamespace

from tests.conftest import FakeSupabase


def _no_state(monkeypatch, mod):
    if hasattr(mod, "set_video_status"):
        monkeypatch.setattr(mod, "set_video_status", lambda *a, **k: None)
    if hasattr(mod, "record_job"):
        monkeypatch.setattr(mod, "record_job", lambda *a, **k: None)
    if hasattr(mod, "log_usage"):
        monkeypatch.setattr(mod, "log_usage", lambda *a, **k: None)


def test_trends_returns_topics():
    from apis.trends import get_topic_candidates
    topics = get_topic_candidates()
    assert len(topics) >= 10
    assert all(isinstance(t, str) and t for t in topics)


def test_research_picks_unused_topic(monkeypatch):
    import worker.tasks.research as mod
    from apis.trends import get_topic_candidates
    candidates = get_topic_candidates()
    # first topic already used by an earlier video
    fake = FakeSupabase({"videos": [{"topic": candidates[0]}]})
    monkeypatch.setattr(mod, "get_supabase", lambda: fake)
    captured = {}
    monkeypatch.setattr(mod, "set_video_status",
                        lambda vid, st, **f: captured.update(vid=vid, status=st, **f))
    monkeypatch.setattr(mod, "record_job", lambda *a, **k: None)

    out = mod.research.run("vid-1")
    assert out == "vid-1"
    assert captured["topic"] == candidates[1]  # first unused
    assert captured["status"] == "scripting"


def test_script_generates_and_stores(monkeypatch):
    import worker.tasks.script as mod
    fake = FakeSupabase({"videos": {"topic": "The lighthouse keeper"}})
    monkeypatch.setattr(mod, "get_supabase", lambda: fake)
    _no_state(monkeypatch, mod)

    fake_result = SimpleNamespace(text="Para one.\n\nPara two.", provider="openai",
                                  model="gpt-5.4", tokens_used=900, cost_usd=0.0045)
    fake_adapter = SimpleNamespace(generate=lambda prompt, model=None: fake_result)
    monkeypatch.setattr(mod, "route", lambda t: (fake_adapter, "gpt-5.4"))

    out = mod.script.run("vid-1")
    assert out == "vid-1"
    ins = fake.queries["scripts"][0].inserted
    assert ins["video_id"] == "vid-1"
    assert ins["body"]["text"] == "Para one.\n\nPara two."
    assert ins["provider"] == "openai"


def test_seo_parses_json_with_fences(monkeypatch):
    import worker.tasks.seo as mod
    fake = FakeSupabase({"scripts": [{"body": {"text": "Once upon a time. " * 50}}]})
    monkeypatch.setattr(mod, "get_supabase", lambda: fake)
    _no_state(monkeypatch, mod)

    meta = {"title": "A Light in the Dark", "description": "d", "tags": ["story"]}
    fenced = "```json\n" + json.dumps(meta) + "\n```"
    fake_result = SimpleNamespace(text=fenced, provider="gemini", model="gemini-2.5-flash",
                                  tokens_used=200, cost_usd=0.00006)
    fake_adapter = SimpleNamespace(generate=lambda prompt, model=None: fake_result)
    monkeypatch.setattr(mod, "route", lambda t: (fake_adapter, "gemini-2.5-flash"))

    out = mod.seo.run("vid-1")
    assert out == "vid-1"
    ins = fake.queries["metadata"][0].inserted
    assert ins["title"] == "A Light in the Dark"
    assert ins["tags"] == ["story"]
