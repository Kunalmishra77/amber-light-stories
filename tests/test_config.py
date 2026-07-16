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
