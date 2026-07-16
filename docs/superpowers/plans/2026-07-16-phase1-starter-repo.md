# Amber Light Stories — Phase 1 Starter Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the complete Phase-1 MVP repo: daily Celery-chain pipeline (research → script → voice → images → assemble → thumbnail → seo → QA hold) with QA-gated YouTube publishing at 09:00 ET and Gmail confirmation.

**Architecture:** FastAPI (state/QA API) + Celery workers on Redis (execution) + Supabase (source of truth for state, audit, costs). Approach A from the spec: Celery Beat schedules; the `jobs` table is audit-only. All external adapters (OpenAI, Gemini, ElevenLabs, YouTube, Gmail) read keys from env only.

**Tech Stack:** Python 3.12, FastAPI, Celery[redis], Supabase-py, openai, google-genai, google-api-python-client, elevenlabs, Pillow, FFmpeg (system binary), pydantic-settings, pytest.

## Global Constraints

- Keys live ONLY in git-ignored `.env`; code reads env via `app/config.py`. Never hardcode a key, never commit `.env`.
- Env var names exactly as in `.env.example` (spec §3 of START-HERE): `OPENAI_API_KEY`, `OPENAI_SCRIPT_MODEL=gpt-5.4`, `OPENAI_CHEAP_MODEL=gpt-5.4-mini`, `OPENAI_REASONING_MODEL=o4-mini`, `GEMINI_API_KEY`, `GEMINI_FLASH_MODEL=gemini-2.5-flash`, `GEMINI_LITE_MODEL=gemini-2.5-flash-lite`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `YT_CHANNEL_ID`, `PUBLISH_TIMEZONE=America/New_York`, `PUBLISH_HOUR=9`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `REDIS_URL`.
- `videos.status` values (exact): `planned|scripting|generating|rendering|qa|ready|scheduled|published|failed`. `jobs.status`: `queued|running|done|failed|dead`.
- Uploads: `privacyStatus="private"` + `publishAt`, `selfDeclaredMadeForKids=False` — always.
- Idempotency: never upload a video whose row already has `yt_video_id`.
- Tests never call live APIs — mock every network client.
- Prompt templates use `.replace("{placeholder}", value)`, NOT `.format()` (templates contain literal JSON braces).
- All tests run from repo root `E:\YouTube-Automation\amber-light` with `.venv\Scripts\python -m pytest`.
- Commit after every task. Working directory for all commands: `E:\YouTube-Automation\amber-light`.
- Whisper captions and Kokoro TTS are deferred (explicit stubs per spec).

---

### Task 1: Project scaffold, pyproject, .env.example, config loader

**Files:**
- Create: `pyproject.toml`, `.env.example`, `app/__init__.py`, `app/config.py`, `worker/__init__.py`, `worker/tasks/__init__.py`, `ai/__init__.py`, `ai/llm/__init__.py`, `ai/tts/__init__.py`, `ai/prompts/__init__.py`, `apis/__init__.py`, `media/__init__.py`, `tests/__init__.py`, `tests/conftest.py`
- Test: `tests/test_config.py`

**Interfaces:**
- Produces: `app.config.Settings` (pydantic-settings, lowercase field per env var above, plus `storage_dir: str = "./storage"` and `notify_email: str = ""`), `app.config.get_settings() -> Settings` (lru_cached), `app.config.storage_path(video_id: str) -> Path` (creates+returns `storage_dir/video_id`).

- [ ] **Step 1: Create pyproject.toml**

```toml
[project]
name = "amber-light"
version = "0.1.0"
description = "Amber Light Stories - automated YouTube storytelling channel"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "celery[redis]>=5.4",
    "supabase>=2.6",
    "openai>=1.40",
    "google-genai>=1.0",
    "google-api-python-client>=2.140",
    "google-auth>=2.30",
    "google-auth-oauthlib>=1.2",
    "elevenlabs>=1.6",
    "pillow>=10.4",
    "pydantic-settings>=2.4",
    "httpx>=0.27",
]

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-mock>=3.14"]

[tool.pytest.ini_options]
testpaths = ["tests"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*", "worker*", "ai*", "apis*", "media*"]
```

- [ ] **Step 2: Create .env.example** (placeholders only — spec §3 plus `NOTIFY_EMAIL`, `STORAGE_DIR`)

```dotenv
# --- OpenAI (PRIMARY) ---
OPENAI_API_KEY=sk-proj-REPLACE_ME
OPENAI_SCRIPT_MODEL=gpt-5.4
OPENAI_CHEAP_MODEL=gpt-5.4-mini
OPENAI_REASONING_MODEL=o4-mini

# --- Gemini (SECONDARY, cheap/high-volume) ---
GEMINI_API_KEY=REPLACE_ME
GEMINI_FLASH_MODEL=gemini-2.5-flash
GEMINI_LITE_MODEL=gemini-2.5-flash-lite

# --- Supabase (data/auth/storage/cron) ---
SUPABASE_URL=https://REPLACE_ME.supabase.co
SUPABASE_ANON_KEY=REPLACE_ME
SUPABASE_SERVICE_ROLE_KEY=REPLACE_ME
SUPABASE_DB_URL=postgresql://postgres:REPLACE_ME@db.REPLACE_ME.supabase.co:6543/postgres

# --- Google / YouTube / Gmail (one OAuth client) ---
GOOGLE_CLIENT_ID=REPLACE_ME
GOOGLE_CLIENT_SECRET=REPLACE_ME
GOOGLE_REFRESH_TOKEN=REPLACE_ME
YT_CHANNEL_ID=REPLACE_ME
PUBLISH_TIMEZONE=America/New_York
PUBLISH_HOUR=9
NOTIFY_EMAIL=you@example.com

# --- ElevenLabs (add when wiring voice) ---
ELEVENLABS_API_KEY=REPLACE_ME
ELEVENLABS_VOICE_ID=REPLACE_ME

# --- Infra ---
REDIS_URL=redis://localhost:6379/0
STORAGE_DIR=./storage
```

- [ ] **Step 3: Create all package `__init__.py` files** (empty files at the paths listed above)

- [ ] **Step 4: Create venv and install**

Run (PowerShell):
```powershell
py -3.12 -m venv .venv
.venv\Scripts\pip install -e ".[dev]"
```
Expected: install succeeds. (If `py -3.12` is unavailable, use `python -m venv .venv` with Python ≥3.12.)

- [ ] **Step 5: Write tests/conftest.py** (dummy env + settings-cache clearing + FakeSupabase used by later tasks)

```python
import os

# Set dummy env BEFORE any app import so Settings never needs a real .env
_DUMMY_ENV = {
    "OPENAI_API_KEY": "sk-test",
    "GEMINI_API_KEY": "gm-test",
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_ANON_KEY": "anon-test",
    "SUPABASE_SERVICE_ROLE_KEY": "service-test",
    "GOOGLE_CLIENT_ID": "cid-test",
    "GOOGLE_CLIENT_SECRET": "csecret-test",
    "GOOGLE_REFRESH_TOKEN": "rtok-test",
    "ELEVENLABS_API_KEY": "el-test",
    "ELEVENLABS_VOICE_ID": "voice-test",
    "NOTIFY_EMAIL": "test@example.com",
    "REDIS_URL": "redis://localhost:6379/0",
}
for k, v in _DUMMY_ENV.items():
    os.environ.setdefault(k, v)

import pytest  # noqa: E402
from types import SimpleNamespace  # noqa: E402


@pytest.fixture(autouse=True)
def clear_settings_cache():
    from app.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class FakeQuery:
    """Chainable stand-in for a supabase table query."""

    def __init__(self, data):
        self._data = data
        self.inserted = None
        self.updated = None
        self.eqs = []

    def select(self, *a, **k):
        return self

    def insert(self, row):
        self.inserted = row
        return self

    def update(self, row):
        self.updated = row
        return self

    def eq(self, col, val):
        self.eqs.append((col, val))
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def single(self):
        return self

    def execute(self):
        return SimpleNamespace(data=self._data)


class FakeSupabase:
    """table_data maps table name -> data returned by execute()."""

    def __init__(self, table_data=None):
        self.table_data = table_data or {}
        self.queries = {}  # table name -> list[FakeQuery]

    def table(self, name):
        q = FakeQuery(self.table_data.get(name, []))
        self.queries.setdefault(name, []).append(q)
        return q


@pytest.fixture
def fake_supabase():
    return FakeSupabase
```

- [ ] **Step 6: Write the failing config test** — `tests/test_config.py`

```python
from app.config import Settings, get_settings, storage_path


def test_settings_load_from_env(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-from-env")
    monkeypatch.setenv("PUBLISH_HOUR", "9")
    s = Settings(_env_file=None)
    assert s.openai_api_key == "sk-from-env"
    assert s.publish_hour == 9
    assert s.openai_script_model == "gpt-5.4"
    assert s.gemini_flash_model == "gemini-2.5-flash"
    assert s.publish_timezone == "America/New_York"


def test_get_settings_is_cached():
    assert get_settings() is get_settings()


def test_storage_path_creates_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    get_settings.cache_clear()
    p = storage_path("vid-123")
    assert p.is_dir()
    assert p.name == "vid-123"
```

- [ ] **Step 7: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_config.py -v`
Expected: FAIL / collection error — `app.config` does not exist.

- [ ] **Step 8: Write app/config.py**

```python
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # OpenAI (primary: scripts, titles, reasoning)
    openai_api_key: str = "REPLACE_ME"
    openai_script_model: str = "gpt-5.4"
    openai_cheap_model: str = "gpt-5.4-mini"
    openai_reasoning_model: str = "o4-mini"

    # Gemini (secondary: research, SEO, tags)
    gemini_api_key: str = "REPLACE_ME"
    gemini_flash_model: str = "gemini-2.5-flash"
    gemini_lite_model: str = "gemini-2.5-flash-lite"

    # Supabase
    supabase_url: str = "https://REPLACE_ME.supabase.co"
    supabase_anon_key: str = "REPLACE_ME"
    supabase_service_role_key: str = "REPLACE_ME"
    supabase_db_url: str = ""

    # Google / YouTube / Gmail
    google_client_id: str = "REPLACE_ME"
    google_client_secret: str = "REPLACE_ME"
    google_refresh_token: str = "REPLACE_ME"
    yt_channel_id: str = ""
    publish_timezone: str = "America/New_York"
    publish_hour: int = 9
    notify_email: str = ""

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""

    # Infra
    redis_url: str = "redis://localhost:6379/0"
    storage_dir: str = "./storage"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def storage_path(video_id: str) -> Path:
    p = Path(get_settings().storage_dir) / video_id
    p.mkdir(parents=True, exist_ok=True)
    return p
```

- [ ] **Step 9: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_config.py -v`
Expected: 3 PASS.

- [ ] **Step 10: Commit**

```powershell
git add pyproject.toml .env.example app worker ai apis media tests
git commit -m "feat: project scaffold, pyproject, env config loader"
```

---

### Task 2: Supabase client, schema.sql, state + usage helpers

**Files:**
- Create: `db/schema.sql`, `app/supabase_client.py`, `app/state.py`, `app/usage.py`
- Test: `tests/test_state.py`

**Interfaces:**
- Consumes: `app.config.get_settings`
- Produces: `app.supabase_client.get_supabase() -> Client` (lru_cached, service-role); `app.state.set_video_status(video_id: str, status: str, **fields) -> None`; `app.state.record_job(video_id: str, type_: str, status: str, error: str | None = None) -> None`; `app.usage.log_usage(provider: str, endpoint: str, units: float, cost_usd: float, video_id: str | None = None) -> None`.

- [ ] **Step 1: Create db/schema.sql** — copy the MVP schema verbatim from START-HERE §5 (`create extension if not exists pg_cron;` through the `analytics` table, including all indexes). Source: `E:\YouTube-Automation\START-HERE-Amber-Light-Stories.md` lines 136–198.

- [ ] **Step 2: Write the failing tests** — `tests/test_state.py`

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_state.py -v`
Expected: FAIL — `app.state` / `app.usage` do not exist.

- [ ] **Step 4: Implement the three modules**

`app/supabase_client.py`:
```python
from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase() -> Client:
    s = get_settings()
    # Service-role key: server-side only, never expose to a client.
    return create_client(s.supabase_url, s.supabase_service_role_key)
```

`app/state.py`:
```python
from datetime import datetime, timezone

from app.supabase_client import get_supabase


def set_video_status(video_id: str, status: str, **fields) -> None:
    payload = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat(), **fields}
    get_supabase().table("videos").update(payload).eq("id", video_id).execute()


def record_job(video_id: str, type_: str, status: str, error: str | None = None) -> None:
    get_supabase().table("jobs").insert(
        {"video_id": video_id, "type": type_, "status": status, "last_error": error}
    ).execute()
```

`app/usage.py`:
```python
from app.supabase_client import get_supabase


def log_usage(provider: str, endpoint: str, units: float, cost_usd: float,
              video_id: str | None = None) -> None:
    get_supabase().table("api_usage").insert(
        {"provider": provider, "endpoint": endpoint, "units": units,
         "cost_usd": cost_usd, "video_id": video_id}
    ).execute()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_state.py -v`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```powershell
git add db app tests
git commit -m "feat: supabase client, schema.sql, state and usage helpers"
```

---

### Task 3: FastAPI app — health + QA gate endpoints

**Files:**
- Create: `app/main.py`, `app/routers/__init__.py`, `app/routers/videos.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `app.supabase_client.get_supabase`
- Produces: FastAPI app `app.main.app`; routes `GET /health`, `GET /videos?status=`, `POST /videos/{id}/approve` (qa→ready), `POST /videos/{id}/reject` (qa→failed, body `{"reason": "..."}`).

- [ ] **Step 1: Write the failing tests** — `tests/test_api.py`

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_api.py -v`
Expected: FAIL — `app.main` / `app.routers.videos` do not exist.

- [ ] **Step 3: Implement**

`app/routers/videos.py`:
```python
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.supabase_client import get_supabase

router = APIRouter(prefix="/videos", tags=["videos"])


class RejectBody(BaseModel):
    reason: str = ""


@router.get("")
def list_videos(status: str | None = None):
    q = get_supabase().table("videos").select("*")
    if status:
        q = q.eq("status", status)
    return q.order("created_at", desc=True).limit(50).execute().data


@router.post("/{video_id}/approve")
def approve(video_id: str):
    data = (
        get_supabase().table("videos")
        .update({"status": "ready", "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", video_id).eq("status", "qa")
        .execute().data
    )
    if not data:
        raise HTTPException(404, "No video awaiting QA with that id")
    return data[0]


@router.post("/{video_id}/reject")
def reject(video_id: str, body: RejectBody):
    data = (
        get_supabase().table("videos")
        .update({"status": "failed", "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", video_id).eq("status", "qa")
        .execute().data
    )
    if not data:
        raise HTTPException(404, "No video awaiting QA with that id")
    return {"rejected": video_id, "reason": body.reason}
```

`app/main.py`:
```python
from fastapi import FastAPI

from app.routers.videos import router as videos_router

app = FastAPI(title="Amber Light Stories")
app.include_router(videos_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

Also create empty `app/routers/__init__.py`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_api.py -v`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```powershell
git add app tests
git commit -m "feat: FastAPI health and QA gate endpoints"
```

---

### Task 4: LLM adapters (OpenAI, Gemini) + router

**Files:**
- Create: `ai/llm/base.py`, `ai/llm/openai_adapter.py`, `ai/llm/gemini_adapter.py`, `ai/llm/router.py`
- Test: `tests/test_llm.py`

**Interfaces:**
- Consumes: `app.config.get_settings`
- Produces: `ai.llm.base.LLMResult` (dataclass: `text: str, provider: str, model: str, tokens_used: int, cost_usd: float`); `OpenAIAdapter.generate(prompt: str, model: str | None = None, system: str | None = None) -> LLMResult` (`.provider == "openai"`); `GeminiAdapter.generate(prompt: str, model: str | None = None) -> LLMResult` (`.provider == "gemini"`); `ai.llm.router.route(task_type: str) -> tuple[adapter, str]` — `"script"`→(openai, script model), `"title"|"description"`→(openai, cheap), `"reasoning"`→(openai, reasoning), `"seo"|"tags"|"research"|"translation"|"analytics"`→(gemini, flash); unknown raises `ValueError`.

- [ ] **Step 1: Write the failing tests** — `tests/test_llm.py`

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_llm.py -v`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`ai/llm/base.py`:
```python
from dataclasses import dataclass


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    tokens_used: int
    cost_usd: float
```

`ai/llm/openai_adapter.py`:
```python
from app.config import get_settings
from ai.llm.base import LLMResult

# Approximate blended $/1K tokens; refine against real invoices later.
PRICING_PER_1K = {"gpt-5.4": 0.005, "gpt-5.4-mini": 0.0006, "o4-mini": 0.004}


class OpenAIAdapter:
    provider = "openai"

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(api_key=get_settings().openai_api_key)
        return self._client

    def generate(self, prompt: str, model: str | None = None,
                 system: str | None = None) -> LLMResult:
        model = model or get_settings().openai_script_model
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = self.client.chat.completions.create(model=model, messages=messages)
        tokens = resp.usage.total_tokens
        cost = tokens / 1000 * PRICING_PER_1K.get(model, 0.005)
        return LLMResult(resp.choices[0].message.content, self.provider, model, tokens, cost)
```

`ai/llm/gemini_adapter.py`:
```python
from app.config import get_settings
from ai.llm.base import LLMResult

PRICING_PER_1K = {"gemini-2.5-flash": 0.0003, "gemini-2.5-flash-lite": 0.0001}


class GeminiAdapter:
    provider = "gemini"

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=get_settings().gemini_api_key)
        return self._client

    def generate(self, prompt: str, model: str | None = None) -> LLMResult:
        model = model or get_settings().gemini_flash_model
        resp = self.client.models.generate_content(model=model, contents=prompt)
        tokens = getattr(resp.usage_metadata, "total_token_count", 0) or 0
        cost = tokens / 1000 * PRICING_PER_1K.get(model, 0.0003)
        return LLMResult(resp.text, self.provider, model, tokens, cost)
```

`ai/llm/router.py`:
```python
from app.config import get_settings
from ai.llm.gemini_adapter import GeminiAdapter
from ai.llm.openai_adapter import OpenAIAdapter

_OPENAI_TASKS = {"script", "title", "description", "reasoning"}
_GEMINI_TASKS = {"seo", "tags", "research", "translation", "analytics"}


def route(task_type: str):
    """Return (adapter, model) for a pipeline task type."""
    s = get_settings()
    if task_type == "script":
        return OpenAIAdapter(), s.openai_script_model
    if task_type in ("title", "description"):
        return OpenAIAdapter(), s.openai_cheap_model
    if task_type == "reasoning":
        return OpenAIAdapter(), s.openai_reasoning_model
    if task_type in _GEMINI_TASKS:
        return GeminiAdapter(), s.gemini_flash_model
    raise ValueError(f"Unknown LLM task type: {task_type}")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_llm.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```powershell
git add ai tests
git commit -m "feat: OpenAI/Gemini adapters and task-type router"
```

---

### Task 5: Prompt templates + loader

**Files:**
- Create: `ai/prompts/story_script.txt`, `ai/prompts/seo.txt`, modify `ai/prompts/__init__.py`
- Test: `tests/test_prompts.py`

**Interfaces:**
- Produces: `ai.prompts.load_prompt(name: str) -> str` (reads `ai/prompts/<name>.txt`, UTF-8). Templates use literal `{topic}` / `{script_excerpt}` markers replaced with `.replace()` by callers (NOT `.format()` — seo.txt contains JSON braces).

- [ ] **Step 1: Write the failing test** — `tests/test_prompts.py`

```python
from ai.prompts import load_prompt


def test_story_prompt_has_topic_marker():
    p = load_prompt("story_script")
    assert "{topic}" in p
    assert "Amber Light Stories" in p


def test_seo_prompt_has_excerpt_marker_and_json():
    p = load_prompt("seo")
    assert "{script_excerpt}" in p
    assert '"title"' in p and '"tags"' in p
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_prompts.py -v`
Expected: FAIL — `load_prompt` not defined.

- [ ] **Step 3: Implement**

`ai/prompts/__init__.py`:
```python
from pathlib import Path


def load_prompt(name: str) -> str:
    return (Path(__file__).parent / f"{name}.txt").read_text(encoding="utf-8")
```

`ai/prompts/story_script.txt`:
```
You are the narrator of "Amber Light Stories", a YouTube channel of warm, reflective short stories for a general adult audience.

Write a complete, original narrated short story about: {topic}

Rules:
- 800 to 1200 words, with a clear beginning, middle, and satisfying ending.
- Warm, reflective, gently suspenseful tone. Vivid sensory detail.
- Plain prose only: no headings, no scene numbers, no stage directions.
- Separate the story into 5 to 8 paragraphs with a blank line between each; every paragraph becomes one visual scene in the video.
- Entirely original content; never retell an existing copyrighted story.
- Suitable for a general audience (not made for kids, but family-safe).
```

`ai/prompts/seo.txt`:
```
Generate YouTube metadata for a narrated short story video on the "Amber Light Stories" channel.

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{"title": "...", "description": "...", "tags": ["...", "..."]}

Constraints:
- title: at most 95 characters, emotionally engaging, no clickbait lies.
- description: 2-3 short paragraphs summarizing the story without spoiling the ending, then one line inviting viewers to subscribe. Max 4500 characters.
- tags: 10 to 15 lowercase tags relevant to storytelling, audiobooks, and the story's themes.

Story excerpt:
{script_excerpt}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_prompts.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```powershell
git add ai tests
git commit -m "feat: versioned prompt templates and loader"
```

---

### Task 6: TTS adapters (ElevenLabs + Kokoro stub)

**Files:**
- Create: `ai/tts/elevenlabs_adapter.py`, `ai/tts/kokoro_adapter.py`
- Test: `tests/test_tts.py`

**Interfaces:**
- Consumes: `app.config.get_settings`, `app.usage.log_usage`
- Produces: `ElevenLabsAdapter.synthesize(text: str, out_path: Path, video_id: str | None = None) -> Path` (writes MP3 bytes, logs usage: provider "elevenlabs", units=char count, cost=chars×0.00011); `KokoroAdapter.synthesize(...)` raises `NotImplementedError` ("Kokoro self-host TTS lands in Phase 1.5 — use ElevenLabs").

- [ ] **Step 1: Write the failing tests** — `tests/test_tts.py`

```python
from unittest.mock import MagicMock

import pytest


def test_elevenlabs_writes_audio_and_logs(tmp_path, monkeypatch):
    import ai.tts.elevenlabs_adapter as mod
    from ai.tts.elevenlabs_adapter import ElevenLabsAdapter

    logged = {}
    monkeypatch.setattr(
        mod, "log_usage",
        lambda provider, endpoint, units, cost_usd, video_id=None: logged.update(
            provider=provider, units=units, cost=cost_usd),
    )
    adapter = ElevenLabsAdapter()
    fake_client = MagicMock()
    fake_client.text_to_speech.convert.return_value = iter([b"ID3", b"audio-bytes"])
    adapter._client = fake_client

    out = adapter.synthesize("Hello world", tmp_path / "voice.mp3", video_id="v1")
    assert out.read_bytes() == b"ID3audio-bytes"
    assert logged["provider"] == "elevenlabs"
    assert logged["units"] == len("Hello world")


def test_kokoro_is_explicit_stub(tmp_path):
    from ai.tts.kokoro_adapter import KokoroAdapter
    with pytest.raises(NotImplementedError):
        KokoroAdapter().synthesize("hi", tmp_path / "x.mp3")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_tts.py -v`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`ai/tts/elevenlabs_adapter.py`:
```python
from pathlib import Path

from app.config import get_settings
from app.usage import log_usage

# ElevenLabs Pro plan works out to roughly $0.11 per 1K characters.
COST_PER_CHAR = 0.00011


class ElevenLabsAdapter:
    provider = "elevenlabs"

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from elevenlabs.client import ElevenLabs
            self._client = ElevenLabs(api_key=get_settings().elevenlabs_api_key)
        return self._client

    def synthesize(self, text: str, out_path: Path, video_id: str | None = None) -> Path:
        s = get_settings()
        audio = self.client.text_to_speech.convert(
            voice_id=s.elevenlabs_voice_id,
            text=text,
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"".join(audio))
        log_usage(self.provider, "tts", len(text), len(text) * COST_PER_CHAR, video_id)
        return out_path
```

`ai/tts/kokoro_adapter.py`:
```python
from pathlib import Path


class KokoroAdapter:
    provider = "kokoro"

    def synthesize(self, text: str, out_path: Path, video_id: str | None = None) -> Path:
        raise NotImplementedError(
            "Kokoro self-host TTS lands in Phase 1.5 — use ElevenLabs"
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_tts.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```powershell
git add ai tests
git commit -m "feat: ElevenLabs TTS adapter and Kokoro stub"
```

---

### Task 7: Google auth + YouTube upload with idempotency

**Files:**
- Create: `apis/google_auth.py`, `apis/youtube.py`
- Test: `tests/test_youtube.py`

**Interfaces:**
- Consumes: `app.config.get_settings`, `app.supabase_client.get_supabase`, `app.usage.log_usage`
- Produces: `apis.google_auth.get_credentials() -> google.oauth2.credentials.Credentials` (built from refresh token); `apis.youtube.upload_video(video_id: str, file_path: str, title: str, description: str, tags: list[str], publish_at_iso: str) -> str` (returns YouTube video id; **returns existing `yt_video_id` without any API call if already set**; on upload sets `status="scheduled"`, `yt_video_id`, `scheduled_at`).

- [ ] **Step 1: Write the failing tests** — `tests/test_youtube.py`

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_youtube.py -v`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`apis/google_auth.py`:
```python
from google.oauth2.credentials import Credentials

from app.config import get_settings

TOKEN_URI = "https://oauth2.googleapis.com/token"


def get_credentials() -> Credentials:
    s = get_settings()
    return Credentials(
        None,
        refresh_token=s.google_refresh_token,
        token_uri=TOKEN_URI,
        client_id=s.google_client_id,
        client_secret=s.google_client_secret,
    )
```

`apis/youtube.py`:
```python
from datetime import datetime, timezone

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from app.supabase_client import get_supabase
from app.usage import log_usage
from apis.google_auth import get_credentials

UPLOAD_QUOTA_UNITS = 100  # per START-HERE §4 note (cheap since Dec 2025)


def upload_video(video_id: str, file_path: str, title: str, description: str,
                 tags: list[str], publish_at_iso: str) -> str:
    """Upload as private+scheduled. Idempotent: never uploads twice."""
    sb = get_supabase()
    row = (sb.table("videos").select("yt_video_id").eq("id", video_id)
           .single().execute().data)
    if row and row.get("yt_video_id"):
        return row["yt_video_id"]

    youtube = build("youtube", "v3", credentials=get_credentials())
    body = {
        "snippet": {
            "title": title[:100],
            "description": description[:4900],
            "tags": tags[:15],
            "categoryId": "24",  # Entertainment
        },
        "status": {
            "privacyStatus": "private",
            "publishAt": publish_at_iso,
            "selfDeclaredMadeForKids": False,
        },
    }
    media = MediaFileUpload(file_path, chunksize=-1, resumable=True, mimetype="video/mp4")
    resp = youtube.videos().insert(part="snippet,status", body=body, media_body=media).execute()
    yt_id = resp["id"]

    sb.table("videos").update({
        "yt_video_id": yt_id,
        "status": "scheduled",
        "scheduled_at": publish_at_iso,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", video_id).execute()
    log_usage("youtube", "videos.insert", UPLOAD_QUOTA_UNITS, 0.0, video_id)
    return yt_id
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_youtube.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```powershell
git add apis tests
git commit -m "feat: Google auth and idempotent YouTube upload"
```

---

### Task 8: Gmail notify + YouTube Analytics fetch

**Files:**
- Create: `apis/gmail.py`, `apis/analytics.py`
- Test: `tests/test_gmail.py`

**Interfaces:**
- Consumes: `apis.google_auth.get_credentials`, `app.config.get_settings`
- Produces: `apis.gmail.send_email(subject: str, body_text: str, to: str | None = None) -> None` (to defaults to `settings.notify_email`); `apis.analytics.fetch_video_stats(yt_video_id: str) -> dict` with keys `views:int, watch_hours:float, avg_view_pct:float, subs_gained:int` (zeros when no rows).

- [ ] **Step 1: Write the failing tests** — `tests/test_gmail.py`

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_gmail.py -v`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`apis/gmail.py`:
```python
import base64
from email.message import EmailMessage

from googleapiclient.discovery import build

from app.config import get_settings
from apis.google_auth import get_credentials


def send_email(subject: str, body_text: str, to: str | None = None) -> None:
    to = to or get_settings().notify_email
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service = build("gmail", "v1", credentials=get_credentials())
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
```

`apis/analytics.py`:
```python
from datetime import date

from googleapiclient.discovery import build

from apis.google_auth import get_credentials


def fetch_video_stats(yt_video_id: str) -> dict:
    service = build("youtubeAnalytics", "v2", credentials=get_credentials())
    resp = service.reports().query(
        ids="channel==MINE",
        startDate="2020-01-01",
        endDate=date.today().isoformat(),
        metrics="views,estimatedMinutesWatched,averageViewPercentage,subscribersGained",
        filters=f"video=={yt_video_id}",
    ).execute()
    rows = resp.get("rows") or []
    if not rows:
        return {"views": 0, "watch_hours": 0.0, "avg_view_pct": 0.0, "subs_gained": 0}
    views, minutes, avg_pct, subs = rows[0]
    return {
        "views": int(views),
        "watch_hours": round(minutes / 60, 2),
        "avg_view_pct": float(avg_pct),
        "subs_gained": int(subs),
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_gmail.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```powershell
git add apis tests
git commit -m "feat: Gmail send and YouTube Analytics fetch"
```

---

### Task 9: Celery app, PipelineTask base, beat schedule

**Files:**
- Create: `worker/celery_app.py`, `worker/beat.py`, `worker/tasks/base.py`
- Test: `tests/test_celery_config.py`

**Interfaces:**
- Consumes: `app.config.get_settings`, `app.state.set_video_status`, `app.state.record_job`
- Produces: `worker.celery_app.celery_app` (Celery instance, broker/backend = `redis_url`, `timezone = settings.publish_timezone`, includes all task modules); `worker.beat.beat_schedule` dict with keys `generate-daily` (03:00), `publish-daily` (09:00), `analytics-daily` (12:00); `worker.tasks.base.PipelineTask` (Celery Task subclass: `autoretry_for=(Exception,)`, `retry_backoff=True`, `retry_backoff_max=600`, `max_retries=3`, `on_failure` marks video failed + job dead).

- [ ] **Step 1: Write the failing tests** — `tests/test_celery_config.py`

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_celery_config.py -v`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`worker/tasks/base.py`:
```python
from celery import Task

from app.state import record_job, set_video_status


class PipelineTask(Task):
    """Base for pipeline steps: retry x3 with backoff, then mark video failed."""

    autoretry_for = (Exception,)
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True
    max_retries = 3

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        video_id = args[0] if args else kwargs.get("video_id")
        if video_id:
            set_video_status(video_id, "failed")
            record_job(video_id, self.name, "dead", error=str(exc))
```

`worker/beat.py`:
```python
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
```

`worker/celery_app.py`:
```python
from celery import Celery

from app.config import get_settings
from worker.beat import beat_schedule

_settings = get_settings()

celery_app = Celery(
    "amber_light",
    broker=_settings.redis_url,
    backend=_settings.redis_url,
    include=[
        "worker.tasks.pipeline",
        "worker.tasks.research",
        "worker.tasks.script",
        "worker.tasks.voice",
        "worker.tasks.images",
        "worker.tasks.assemble",
        "worker.tasks.thumbnail",
        "worker.tasks.seo",
        "worker.tasks.qa",
        "worker.tasks.publish",
        "worker.tasks.notify",
        "worker.tasks.analytics",
    ],
)
celery_app.conf.timezone = _settings.publish_timezone
celery_app.conf.beat_schedule = beat_schedule
celery_app.conf.task_acks_late = True
celery_app.conf.worker_prefetch_multiplier = 1
```

Note: the task modules named in `include` don't exist yet — that's fine; Celery only imports them at worker startup, and the config tests don't start a worker. They are created in Tasks 10–12.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_celery_config.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```powershell
git add worker tests
git commit -m "feat: celery app, retrying PipelineTask base, ET beat schedule"
```

---

### Task 10: Content tasks — trends, research, script, seo

**Files:**
- Create: `apis/trends.py`, `worker/tasks/research.py`, `worker/tasks/script.py`, `worker/tasks/seo.py`
- Test: `tests/test_content_tasks.py`

**Interfaces:**
- Consumes: `ai.llm.router.route`, `ai.prompts.load_prompt`, `app.state.*`, `app.usage.log_usage`, `worker.tasks.base.PipelineTask`, `worker.celery_app.celery_app`
- Produces: `apis.trends.get_topic_candidates() -> list[str]` (static evergreen list, ≥10 topics — explicit stub until a cached trend source is wired); Celery tasks `research(video_id) -> str`, `script(video_id) -> str`, `seo(video_id) -> str` — each returns `video_id`, each callable as plain function via `.run` semantics (tests call the underlying function). `seo` parses model JSON (strips ```json fences if present) and inserts a `metadata` row.

- [ ] **Step 1: Write the failing tests** — `tests/test_content_tasks.py`

```python
import json
from types import SimpleNamespace

from tests.conftest import FakeSupabase


def _no_state(monkeypatch, mod):
    monkeypatch.setattr(mod, "set_video_status", lambda *a, **k: None)
    monkeypatch.setattr(mod, "record_job", lambda *a, **k: None)
    monkeypatch.setattr(mod, "log_usage", lambda *a, **k: None, raising=False)


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_content_tasks.py -v`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`apis/trends.py`:
```python
# Static evergreen topics. Explicit stub: replace with a cached YouTube-search /
# Google-Trends source later (search quota is ~100 calls/day — always cache).
EVERGREEN_TOPICS = [
    "The lighthouse keeper who received letters from the future",
    "An old violin found in the attic that plays by itself at midnight",
    "The last train conductor on a line nobody rides anymore",
    "A grandmother's recipe book with notes that predict the family's fate",
    "The night the entire town's clocks ran backwards",
    "A mailman who delivered a letter forty years too late",
    "The antique shop that only appears during thunderstorms",
    "Two strangers who keep meeting in dreams before they ever meet in life",
    "The gardener who could hear what the trees remembered",
    "A payphone in the desert that rings once a year",
    "The bookbinder who discovered a diary written in her own handwriting",
    "A small café where every customer leaves happier than they arrived",
]


def get_topic_candidates() -> list[str]:
    return EVERGREEN_TOPICS
```

`worker/tasks/research.py`:
```python
from app.state import record_job, set_video_status
from app.supabase_client import get_supabase
from apis.trends import get_topic_candidates
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.research.research")
def research(self, video_id: str) -> str:
    used_rows = get_supabase().table("videos").select("topic").execute().data or []
    used = {r.get("topic") for r in used_rows}
    candidates = get_topic_candidates()
    topic = next((t for t in candidates if t not in used), None)
    if topic is None:
        # All evergreen topics used: recycle with a sequel marker.
        topic = f"{candidates[0]} — part {len(used_rows) + 1}"
    set_video_status(video_id, "scripting", topic=topic)
    record_job(video_id, "research", "done")
    return video_id
```

`worker/tasks/script.py`:
```python
from ai.llm.router import route
from ai.prompts import load_prompt
from app.state import record_job, set_video_status
from app.supabase_client import get_supabase
from app.usage import log_usage
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.script.script")
def script(self, video_id: str) -> str:
    sb = get_supabase()
    video = sb.table("videos").select("topic").eq("id", video_id).single().execute().data
    adapter, model = route("script")
    prompt = load_prompt("story_script").replace("{topic}", video["topic"])
    result = adapter.generate(prompt, model=model)
    sb.table("scripts").insert({
        "video_id": video_id,
        "brief": {"topic": video["topic"]},
        "body": {"text": result.text},
        "provider": result.provider,
        "tokens_used": result.tokens_used,
    }).execute()
    log_usage(result.provider, "script", result.tokens_used, result.cost_usd, video_id)
    record_job(video_id, "script", "done")
    return video_id
```

`worker/tasks/seo.py`:
```python
import json

from ai.llm.router import route
from ai.prompts import load_prompt
from app.state import record_job
from app.supabase_client import get_supabase
from app.usage import log_usage
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.seo.seo")
def seo(self, video_id: str) -> str:
    sb = get_supabase()
    scripts = (sb.table("scripts").select("body").eq("video_id", video_id)
               .order("created_at", desc=True).limit(1).execute().data)
    excerpt = scripts[0]["body"]["text"][:1500]
    adapter, model = route("seo")
    prompt = load_prompt("seo").replace("{script_excerpt}", excerpt)
    result = adapter.generate(prompt, model=model)
    meta = _parse_json(result.text)
    sb.table("metadata").insert({
        "video_id": video_id,
        "title": meta["title"][:100],
        "description": meta["description"][:4900],
        "tags": meta.get("tags", []),
    }).execute()
    log_usage(result.provider, "seo", result.tokens_used, result.cost_usd, video_id)
    record_job(video_id, "seo", "done")
    return video_id
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_content_tasks.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```powershell
git add apis worker tests
git commit -m "feat: research, script, and seo pipeline tasks with static trends stub"
```

---

### Task 11: Media rendering — stills, Ken-Burns FFmpeg, thumbnail + tasks

**Files:**
- Create: `media/render.py`, `media/fonts/.gitkeep`, `media/music/.gitkeep`, `media/templates/.gitkeep`, `worker/tasks/images.py`, `worker/tasks/assemble.py`, `worker/tasks/thumbnail.py`
- Test: `tests/test_media.py`

**Interfaces:**
- Consumes: `app.config.storage_path`, `app.state.*`, `worker.tasks.base.PipelineTask`
- Produces: `media.render.make_still(text: str, out_path: Path, size=(1920,1080)) -> Path` (Pillow gradient + wrapped text, placeholder until a real image source is chosen); `media.render.make_thumbnail(title: str, out_path: Path) -> Path` (1280×720); `media.render.build_kenburns_command(image_paths: list[Path], audio_path: Path, out_path: Path, seconds_per_image: int = 8, fps: int = 30) -> list[str]` (full ffmpeg argv with zoompan+concat); Celery tasks `images(video_id) -> str`, `assemble(video_id) -> str` (runs ffmpeg via `subprocess.run(check=True)`, sets `storage_key`, status `rendering`), `thumbnail(video_id) -> str`.

- [ ] **Step 1: Write the failing tests** — `tests/test_media.py`

```python
from pathlib import Path

from media.render import build_kenburns_command, make_still, make_thumbnail


def test_make_still_writes_1080p_png(tmp_path):
    out = make_still("A quiet evening by the sea.", tmp_path / "s1.png")
    from PIL import Image
    with Image.open(out) as im:
        assert im.size == (1920, 1080)


def test_make_thumbnail_720p(tmp_path):
    out = make_thumbnail("The Lighthouse Keeper", tmp_path / "thumb.png")
    from PIL import Image
    with Image.open(out) as im:
        assert im.size == (1280, 720)


def test_kenburns_command_structure(tmp_path):
    imgs = [tmp_path / "a.png", tmp_path / "b.png", tmp_path / "c.png"]
    cmd = build_kenburns_command(imgs, tmp_path / "voice.mp3", tmp_path / "out.mp4",
                                 seconds_per_image=8, fps=30)
    assert cmd[0] == "ffmpeg"
    assert cmd.count("-i") == 4  # 3 images + 1 audio
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "zoompan" in fc and "concat=n=3" in fc
    assert str(tmp_path / "out.mp4") == cmd[-1]
    assert "libx264" in cmd
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_media.py -v`
Expected: FAIL — `media.render` does not exist.

- [ ] **Step 3: Implement media/render.py**

```python
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Warm "amber light" placeholder palette until a real image source is wired.
_TOP = (28, 18, 46)      # deep violet
_BOTTOM = (196, 106, 32)  # amber


def _gradient(size) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(_TOP[0] + (_BOTTOM[0] - _TOP[0]) * t)
        g = int(_TOP[1] + (_BOTTOM[1] - _TOP[1]) * t)
        b = int(_TOP[2] + (_BOTTOM[2] - _TOP[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def _font(px_size: int):
    custom = Path(__file__).parent / "fonts"
    for f in sorted(custom.glob("*.ttf")):
        return ImageFont.truetype(str(f), px_size)
    return ImageFont.load_default(size=px_size)


def make_still(text: str, out_path: Path, size=(1920, 1080)) -> Path:
    img = _gradient(size)
    draw = ImageDraw.Draw(img)
    excerpt = textwrap.fill(text[:220], width=42)
    draw.multiline_text((size[0] // 2, size[1] // 2), excerpt, font=_font(52),
                        fill=(245, 235, 220), anchor="mm", align="center", spacing=14)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")
    return out_path


def make_thumbnail(title: str, out_path: Path) -> Path:
    size = (1280, 720)
    img = _gradient(size)
    draw = ImageDraw.Draw(img)
    wrapped = textwrap.fill(title[:80], width=20)
    draw.multiline_text((size[0] // 2, size[1] // 2), wrapped, font=_font(72),
                        fill=(255, 244, 224), anchor="mm", align="center", spacing=10)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")
    return out_path


def build_kenburns_command(image_paths: list[Path], audio_path: Path, out_path: Path,
                           seconds_per_image: int = 8, fps: int = 30) -> list[str]:
    """ffmpeg argv: slow zoom (Ken Burns) per still, concat, narration audio."""
    cmd = ["ffmpeg", "-y"]
    for img in image_paths:
        cmd += ["-loop", "1", "-t", str(seconds_per_image), "-i", str(img)]
    cmd += ["-i", str(audio_path)]

    frames = seconds_per_image * fps
    parts = []
    for i in range(len(image_paths)):
        parts.append(
            f"[{i}:v]scale=1920:1080,"
            f"zoompan=z='min(zoom+0.0009,1.15)':d={frames}:s=1920x1080:fps={fps}[v{i}]"
        )
    concat_in = "".join(f"[v{i}]" for i in range(len(image_paths)))
    parts.append(f"{concat_in}concat=n={len(image_paths)}:v=1:a=0[v]")

    cmd += [
        "-filter_complex", ";".join(parts),
        "-map", "[v]", "-map", f"{len(image_paths)}:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
        "-movflags", "+faststart", "-shortest",
        str(out_path),
    ]
    return cmd
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_media.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Implement the three Celery task wrappers**

`worker/tasks/images.py`:
```python
from app.config import storage_path
from app.state import record_job, set_video_status
from app.supabase_client import get_supabase
from media.render import make_still
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask

MAX_SCENES = 8


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.images.images")
def images(self, video_id: str) -> str:
    set_video_status(video_id, "generating")
    sb = get_supabase()
    scripts = (sb.table("scripts").select("body").eq("video_id", video_id)
               .order("created_at", desc=True).limit(1).execute().data)
    text = scripts[0]["body"]["text"]
    scenes = [p.strip() for p in text.split("\n\n") if p.strip()][:MAX_SCENES]
    out_dir = storage_path(video_id)
    for i, scene in enumerate(scenes):
        make_still(scene, out_dir / f"img_{i:02d}.png")
    record_job(video_id, "images", "done")
    return video_id
```

`worker/tasks/assemble.py`:
```python
import subprocess

from app.config import storage_path
from app.state import record_job, set_video_status
from media.render import build_kenburns_command
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.assemble.assemble")
def assemble(self, video_id: str) -> str:
    set_video_status(video_id, "rendering")
    out_dir = storage_path(video_id)
    image_paths = sorted(out_dir.glob("img_*.png"))
    audio_path = out_dir / "voice.mp3"
    final_path = out_dir / "final.mp4"
    cmd = build_kenburns_command(image_paths, audio_path, final_path)
    subprocess.run(cmd, check=True, capture_output=True)
    set_video_status(video_id, "rendering", storage_key=str(final_path))
    record_job(video_id, "assemble", "done")
    return video_id
```

`worker/tasks/thumbnail.py`:
```python
from app.config import storage_path
from app.state import record_job
from app.supabase_client import get_supabase
from media.render import make_thumbnail
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.thumbnail.thumbnail")
def thumbnail(self, video_id: str) -> str:
    sb = get_supabase()
    video = sb.table("videos").select("topic").eq("id", video_id).single().execute().data
    make_thumbnail(video["topic"], storage_path(video_id) / "thumb.png")
    record_job(video_id, "thumbnail", "done")
    return video_id
```

- [ ] **Step 6: Run the whole suite**

Run: `.venv\Scripts\python -m pytest -v`
Expected: all PASS (no new tests for the thin wrappers — logic lives in `media.render`, already covered).

- [ ] **Step 7: Commit**

```powershell
git add media worker tests
git commit -m "feat: Pillow stills, Ken-Burns FFmpeg command builder, media tasks"
```

---

### Task 12: voice, qa, publish, notify, analytics tasks + pipeline chain

**Files:**
- Create: `worker/tasks/voice.py`, `worker/tasks/qa.py`, `worker/tasks/publish.py`, `worker/tasks/notify.py`, `worker/tasks/analytics.py`, `worker/tasks/pipeline.py`
- Test: `tests/test_pipeline.py`

**Interfaces:**
- Consumes: everything above (`ElevenLabsAdapter`, `upload_video`, `send_email`, `fetch_video_stats`, state helpers, `celery_app`)
- Produces: `voice(video_id) -> str`; `qa_hold(video_id) -> str` (status→`qa`); `publish.publish_ready_videos()` (queries `ready`, uploads each via `upload_video` with `next_publish_iso()`, queues `notify_published`); `publish.next_publish_iso() -> str` (today at `publish_hour` ET as UTC ISO, +5 min if already past); `notify.notify_published(video_id, yt_video_id)`; `analytics.snapshot_analytics()` (snapshots stats for scheduled/published videos, flips scheduled→published when `scheduled_at` has passed); `pipeline.start_daily_generation()` (creates `videos` row with fresh `idempotency_key`, launches chain); `pipeline.build_pipeline(video_id) -> celery.chain` in order research→script→voice→images→assemble→thumbnail→seo→qa_hold using `.si()` immutable signatures.

- [ ] **Step 1: Write the failing tests** — `tests/test_pipeline.py`

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python -m pytest tests/test_pipeline.py -v`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`worker/tasks/voice.py`:
```python
from ai.tts.elevenlabs_adapter import ElevenLabsAdapter
from app.config import storage_path
from app.state import record_job, set_video_status
from app.supabase_client import get_supabase
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.voice.voice")
def voice(self, video_id: str) -> str:
    set_video_status(video_id, "generating")
    sb = get_supabase()
    scripts = (sb.table("scripts").select("body").eq("video_id", video_id)
               .order("created_at", desc=True).limit(1).execute().data)
    text = scripts[0]["body"]["text"]
    ElevenLabsAdapter().synthesize(text, storage_path(video_id) / "voice.mp3", video_id)
    record_job(video_id, "voice", "done")
    return video_id
```

`worker/tasks/qa.py`:
```python
from app.state import record_job, set_video_status
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.qa.qa_hold")
def qa_hold(self, video_id: str) -> str:
    # Human gate: video waits here until approved via POST /videos/{id}/approve.
    set_video_status(video_id, "qa")
    record_job(video_id, "qa_hold", "done")
    return video_id
```

`worker/tasks/publish.py`:
```python
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.supabase_client import get_supabase
from apis.youtube import upload_video
from worker.celery_app import celery_app
from worker.tasks.notify import notify_published


def next_publish_iso() -> str:
    """Today at PUBLISH_HOUR ET, as UTC ISO-8601. +5 min if already past."""
    s = get_settings()
    tz = ZoneInfo(s.publish_timezone)
    now_local = datetime.now(tz)
    target = now_local.replace(hour=s.publish_hour, minute=0, second=0, microsecond=0)
    if target <= now_local:
        target = now_local + timedelta(minutes=5)
    return target.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@celery_app.task(name="worker.tasks.publish.publish_ready_videos")
def publish_ready_videos():
    sb = get_supabase()
    ready = sb.table("videos").select("*").eq("status", "ready").execute().data or []
    for row in ready:
        meta_rows = (sb.table("metadata").select("*").eq("video_id", row["id"])
                     .order("created_at", desc=True).limit(1).execute().data)
        m = meta_rows[0] if meta_rows else {}
        yt_id = upload_video(
            row["id"], row["storage_key"],
            m.get("title") or row["topic"],
            m.get("description") or "",
            m.get("tags") or [],
            next_publish_iso(),
        )
        notify_published.delay(row["id"], yt_id)
```

`worker/tasks/notify.py`:
```python
from apis.gmail import send_email
from app.state import record_job
from worker.celery_app import celery_app


@celery_app.task(name="worker.tasks.notify.notify_published")
def notify_published(video_id: str, yt_video_id: str):
    url = f"https://youtu.be/{yt_video_id}"
    send_email(
        subject="Amber Light Stories — video scheduled ✅",
        body_text=f"Your video is uploaded and scheduled.\n\nWatch: {url}\n",
    )
    record_job(video_id, "notify", "done")
```

`worker/tasks/analytics.py`:
```python
from datetime import datetime, timezone

from apis.analytics import fetch_video_stats
from app.state import set_video_status
from app.supabase_client import get_supabase
from worker.celery_app import celery_app


@celery_app.task(name="worker.tasks.analytics.snapshot_analytics")
def snapshot_analytics():
    sb = get_supabase()
    now = datetime.now(timezone.utc)
    for status in ("scheduled", "published"):
        rows = sb.table("videos").select("*").eq("status", status).execute().data or []
        for row in rows:
            if not row.get("yt_video_id"):
                continue
            if status == "scheduled" and row.get("scheduled_at"):
                sched = datetime.fromisoformat(row["scheduled_at"].replace("Z", "+00:00"))
                if sched <= now:
                    set_video_status(row["id"], "published",
                                     published_at=row["scheduled_at"])
            stats = fetch_video_stats(row["yt_video_id"])
            sb.table("analytics").insert({"video_id": row["id"], **stats}).execute()
```

`worker/tasks/pipeline.py`:
```python
from uuid import uuid4

from celery import chain

from app.supabase_client import get_supabase
from worker.celery_app import celery_app
from worker.tasks.assemble import assemble
from worker.tasks.images import images
from worker.tasks.qa import qa_hold
from worker.tasks.research import research
from worker.tasks.script import script
from worker.tasks.seo import seo
from worker.tasks.thumbnail import thumbnail
from worker.tasks.voice import voice


def build_pipeline(video_id: str):
    return chain(
        research.si(video_id),
        script.si(video_id),
        voice.si(video_id),
        images.si(video_id),
        assemble.si(video_id),
        thumbnail.si(video_id),
        seo.si(video_id),
        qa_hold.si(video_id),
    )


@celery_app.task(name="worker.tasks.pipeline.start_daily_generation")
def start_daily_generation():
    row = get_supabase().table("videos").insert({
        "status": "planned",
        "idempotency_key": str(uuid4()),
    }).execute().data[0]
    build_pipeline(row["id"]).delay()
```

Note: `start_daily_generation` inserts without `channel_id` for MVP simplicity; `scripts/seed.py` (Task 13) creates the channel row and the column is nullable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python -m pytest tests/test_pipeline.py -v`
Expected: 5 PASS. Then run the full suite: `.venv\Scripts\python -m pytest` — all PASS.

- [ ] **Step 5: Commit**

```powershell
git add worker tests
git commit -m "feat: voice/qa/publish/notify/analytics tasks and daily pipeline chain"
```

---

### Task 13: Operator scripts — get_refresh_token.py, seed.py

**Files:**
- Create: `scripts/get_refresh_token.py`, `scripts/seed.py`

**Interfaces:**
- Consumes: `app.config.get_settings`, `app.supabase_client.get_supabase`
- Produces: standalone CLI scripts (run with `.venv\Scripts\python scripts\get_refresh_token.py`). Not unit-tested — they are interactive/one-shot operator tools; verified by running them during real setup.

- [ ] **Step 1: Write scripts/get_refresh_token.py**

```python
"""One-time OAuth consent flow. Prints the refresh token to store in .env.

Usage:
    .venv\\Scripts\\python scripts\\get_refresh_token.py

Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET already set in .env
(create them at console.cloud.google.com -> Credentials -> OAuth client -> Desktop app).
"""
from google_auth_oauthlib.flow import InstalledAppFlow

from app.config import get_settings

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


def main():
    s = get_settings()
    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": s.google_client_id,
                "client_secret": s.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        SCOPES,
    )
    creds = flow.run_local_server(port=0, access_type="offline", prompt="consent")
    print("\n=== SUCCESS ===")
    print("Put this in your .env as GOOGLE_REFRESH_TOKEN:\n")
    print(creds.refresh_token)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write scripts/seed.py**

```python
"""Seed the single Phase-1 channel row (idempotent)."""
from app.config import get_settings
from app.supabase_client import get_supabase


def main():
    sb = get_supabase()
    existing = sb.table("channels").select("id").limit(1).execute().data
    if existing:
        print(f"Channel already seeded: {existing[0]['id']}")
        return
    row = sb.table("channels").insert({
        "name": "Amber Light Stories",
        "yt_channel_id": get_settings().yt_channel_id or None,
    }).execute().data[0]
    print(f"Seeded channel: {row['id']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Sanity-check imports** (no OAuth flow run — just verify the modules parse)

Run: `.venv\Scripts\python -c "import ast, pathlib; [ast.parse(pathlib.Path(p).read_text(encoding='utf-8')) for p in ('scripts/get_refresh_token.py','scripts/seed.py')]; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```powershell
git add scripts
git commit -m "feat: refresh-token and seed operator scripts"
```

---

### Task 14: Docker, README, final verification

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `README.md`, `.dockerignore`

**Interfaces:**
- Consumes: the whole repo
- Produces: `docker compose up` runs api (:8000) + worker(+beat) + redis, all reading `.env`; deployable to Coolify unchanged.

- [ ] **Step 1: Write Dockerfile**

```dockerfile
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
COPY worker ./worker
COPY ai ./ai
COPY apis ./apis
COPY media ./media
COPY scripts ./scripts
COPY db ./db
RUN pip install --no-cache-dir .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Write .dockerignore**

```
.venv/
.git/
storage/
__pycache__/
*.pyc
.env
.env.*
docs/
tests/
```

- [ ] **Step 3: Write docker-compose.yml**

```yaml
services:
  api:
    build: .
    env_file: .env
    ports:
      - "8000:8000"
    volumes:
      - ./storage:/app/storage
    depends_on:
      - redis
    environment:
      - REDIS_URL=redis://redis:6379/0
      - STORAGE_DIR=/app/storage

  worker:
    build: .
    command: celery -A worker.celery_app:celery_app worker --beat --loglevel=info
    env_file: .env
    volumes:
      - ./storage:/app/storage
    depends_on:
      - redis
    environment:
      - REDIS_URL=redis://redis:6379/0
      - STORAGE_DIR=/app/storage

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

- [ ] **Step 4: Write README.md**

```markdown
# Amber Light Stories — Phase 1

Automated YouTube storytelling channel. One video per day: generated at 03:00 ET,
human-QA-gated, published at 09:00 ET, Gmail confirmation on schedule.

Specs: `docs/superpowers/specs/`. Source plan: `docs/superpowers/plans/`.

## Setup (once)

1. **Rotate compromised keys** (OpenAI, Supabase, Gemini) — see START-HERE §0.
2. `copy .env.example .env` and fill in the **rotated** keys.
3. Google Cloud: create project, enable YouTube Data v3 + YouTube Analytics + Gmail
   APIs, create OAuth Desktop client (START-HERE §4). Put client id/secret in `.env`.
4. `.venv\Scripts\python scripts\get_refresh_token.py` → paste token into `.env`.
5. Run `db/schema.sql` in the Supabase SQL editor.
6. `.venv\Scripts\python scripts\seed.py` → seeds the channel row.

## Run

    docker compose up --build

- API: http://localhost:8000/health
- QA queue: `GET /videos?status=qa`, then `POST /videos/{id}/approve` or `/reject`.

## Dev

    py -3.12 -m venv .venv
    .venv\Scripts\pip install -e ".[dev]"
    .venv\Scripts\python -m pytest

## Pipeline

research → script (OpenAI) → voice (ElevenLabs) → images (stills) →
assemble (FFmpeg Ken-Burns) → thumbnail → seo (Gemini) → **QA hold** →
publish (09:00 ET, private+publishAt, idempotent) → Gmail notify.

Costs land in `api_usage`; job audit in `jobs`; all state in `videos.status`.
```

- [ ] **Step 5: Validate compose file and run full suite**

Run: `docker compose config -q`
Expected: exit 0, no output. (Requires Docker Desktop running; if unavailable, note it and continue — the YAML is validated at first `up`.)

Run: `.venv\Scripts\python -m pytest -v`
Expected: ALL tests pass (≈29).

- [ ] **Step 6: Commit**

```powershell
git add Dockerfile .dockerignore docker-compose.yml README.md
git commit -m "feat: docker compose stack and README"
```

---

## Post-plan manual steps (user, not implementer)

1. Rotate OpenAI / Supabase / Gemini keys; fill `.env` from `.env.example` with rotated values; delete `E:\YouTube-Automation\credentials-youtube-automation.txt` after confirming rotation.
2. Google Cloud project + OAuth client + enable 3 APIs (START-HERE §4).
3. Run `scripts/get_refresh_token.py`; store token.
4. Run `db/schema.sql` in Supabase; run `scripts/seed.py`.
5. `docker compose up --build`; check `/health`; trigger one manual pipeline run: `docker compose exec worker celery -A worker.celery_app:celery_app call worker.tasks.pipeline.start_daily_generation`.
6. Approve the QA'd video; verify scheduled upload + Gmail confirmation with an unlisted dry-run first.
