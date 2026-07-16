from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


def test_router_routes_by_task_type():
    from ai.llm.router import route
    adapter, model = route("script")
    assert adapter.provider == "openai" and model == "gpt-5.4"
    adapter, model = route("title")
    assert adapter.provider == "openai" and model == "gpt-5.4-mini"
    adapter, model = route("reasoning")
    assert adapter.provider == "openai" and model == "o4-mini"
    for t in ("seo", "tags", "research", "translation", "analytics"):
        adapter, model = route(t)
        assert adapter.provider == "gemini" and model == "gemini-2.5-flash"


def test_router_rejects_unknown():
    from ai.llm.router import route
    with pytest.raises(ValueError):
        route("juggling")


def test_openai_adapter_generate(monkeypatch):
    from ai.llm.openai_adapter import OpenAIAdapter
    fake_resp = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="Once upon a time"))],
        usage=SimpleNamespace(total_tokens=1000),
    )
    adapter = OpenAIAdapter()
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = fake_resp
    adapter._client = fake_client
    result = adapter.generate("write a story", model="gpt-5.4")
    assert result.text == "Once upon a time"
    assert result.provider == "openai"
    assert result.tokens_used == 1000
    assert result.cost_usd > 0


def test_gemini_adapter_generate(monkeypatch):
    from ai.llm.gemini_adapter import GeminiAdapter
    fake_resp = SimpleNamespace(
        text="tags: story",
        usage_metadata=SimpleNamespace(total_token_count=500),
    )
    adapter = GeminiAdapter()
    fake_client = MagicMock()
    fake_client.models.generate_content.return_value = fake_resp
    adapter._client = fake_client
    result = adapter.generate("make tags")
    assert result.text == "tags: story"
    assert result.provider == "gemini"
    assert result.tokens_used == 500
