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
