from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase() -> Client:
    s = get_settings()
    # Service-role key: server-side only, never expose to a client.
    return create_client(s.supabase_url, s.supabase_service_role_key)
