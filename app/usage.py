from app.supabase_client import get_supabase


def log_usage(provider: str, endpoint: str, units: float, cost_usd: float,
              video_id: str | None = None) -> None:
    get_supabase().table("api_usage").insert(
        {"provider": provider, "endpoint": endpoint, "units": units,
         "cost_usd": cost_usd, "video_id": video_id}
    ).execute()
