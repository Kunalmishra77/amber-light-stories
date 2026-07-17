import json

from ai.llm.router import route
from ai.prompts import load_prompt
from app.state import record_job
from app.supabase_client import get_supabase
from app.usage import log_usage
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.seo.seo")
def seo(self, video_id: str) -> str:
    sb = get_supabase()
    scripts = (sb.table("scripts").select("body").eq("video_id", video_id)
               .order("created_at", desc=True).limit(1).execute().data)
    excerpt = scripts[0]["body"]["text"][:1500]
    adapter, model = route("seo")
    prompt = load_prompt("seo").replace("{script_excerpt}", excerpt)
    result = adapter.generate(prompt, model=model)
    meta = _parse_json(result.text)
    sb.table("metadata").insert({
        "video_id": video_id,
        "title": meta["title"][:100],
        "description": meta["description"][:4900],
        "tags": meta.get("tags", []),
    }).execute()
    log_usage(result.provider, "seo", result.tokens_used, result.cost_usd, video_id)
    record_job(video_id, "seo", "done")
    return video_id
