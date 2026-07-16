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
