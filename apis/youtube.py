from datetime import datetime, timezone
from pathlib import Path

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from app.supabase_client import get_supabase
from app.usage import log_usage
from apis.google_auth import get_credentials

UPLOAD_QUOTA_UNITS = 100  # per START-HERE §4 note (cheap since Dec 2025)


def upload_video(video_id: str, file_path: str, title: str, description: str,
                 tags: list[str], publish_at_iso: str,
                 thumbnail_path: str | None = None) -> str:
    """Upload as private+scheduled. Idempotent: never uploads twice."""
    sb = get_supabase()
    row = (sb.table("videos").select("yt_video_id").eq("id", video_id)
           .single().execute().data)
    if row and row.get("yt_video_id"):
        return row["yt_video_id"]

    sb.table("videos").update({
        "status": "uploading",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", video_id).execute()

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

    if thumbnail_path and Path(thumbnail_path).exists():
        youtube.thumbnails().set(videoId=yt_id, media_body=MediaFileUpload(thumbnail_path)).execute()

    sb.table("videos").update({
        "yt_video_id": yt_id,
        "status": "scheduled",
        "scheduled_at": publish_at_iso,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", video_id).execute()
    log_usage("youtube", "videos.insert", UPLOAD_QUOTA_UNITS, 0.0, video_id)
    return yt_id
