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
