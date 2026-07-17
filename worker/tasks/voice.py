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
