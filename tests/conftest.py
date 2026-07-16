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
