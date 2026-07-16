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
