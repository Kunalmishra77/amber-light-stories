from ai.llm.router import route
from ai.prompts import load_prompt
from app.state import record_job
from app.supabase_client import get_supabase
from app.usage import log_usage
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.script.script")
def script(self, video_id: str) -> str:
    sb = get_supabase()
    video = sb.table("videos").select("topic").eq("id", video_id).single().execute().data
    adapter, model = route("script")
    prompt = load_prompt("story_script").replace("{topic}", video["topic"])
    result = adapter.generate(prompt, model=model)
    sb.table("scripts").insert({
        "video_id": video_id,
        "brief": {"topic": video["topic"]},
        "body": {"text": result.text},
        "provider": result.provider,
        "tokens_used": result.tokens_used,
    }).execute()
    log_usage(result.provider, "script", result.tokens_used, result.cost_usd, video_id)
    record_job(video_id, "script", "done")
    return video_id
