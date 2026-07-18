"""Model routing: which concrete fal.ai model each quality/tier maps to.
Stored in `settings` (kind='model_routing'), editable from the dashboard --
changing models is a config edit, never a code change (per the
cost-optimization spec, section 5).
"""
from app.supabase_client import get_supabase

DEFAULT_ROUTING = {
    "image": {
        "High": "fal-ai/flux/dev",
        "Medium": "fal-ai/flux/schnell",
        "Low": "fal-ai/flux/schnell",
    },
    "motion": {
        "premium": "fal-ai/kling-video/v2/master/image-to-video",
        "standard": "fal-ai/kling-video/v1.6/standard/image-to-video",
        "cheap": "fal-ai/ltx-video-13b-distilled/image-to-video",
    },
    "thumbnail": "fal-ai/flux/dev",
}

# Rough $/call estimates used by the cost governor (refine against real
# invoices later). Kept here alongside routing since they're keyed the
# same way (quality tier / motion tier).
IMAGE_COST_ESTIMATE = {"High": 0.035, "Medium": 0.02, "Low": 0.01}
MOTION_COST_ESTIMATE = {"premium": 1.35, "standard": 0.35, "cheap": 0.15}
THUMBNAIL_COST_ESTIMATE = 0.02


def load_model_routing(project_id: str) -> dict:
    """Load model_routing from `settings`; fall back to DEFAULT_ROUTING if
    unset for this project."""
    sb = get_supabase()
    rows = (sb.table("settings").select("value").eq("project_id", project_id)
            .eq("kind", "model_routing").limit(1).execute().data)
    if rows:
        return rows[0]["value"]
    return DEFAULT_ROUTING


def image_model(routing: dict, quality: str) -> str:
    return routing.get("image", DEFAULT_ROUTING["image"]).get(
        quality, DEFAULT_ROUTING["image"]["Medium"])


def motion_model(routing: dict, tier: str) -> str:
    return routing.get("motion", DEFAULT_ROUTING["motion"]).get(
        tier, DEFAULT_ROUTING["motion"]["standard"])


def thumbnail_model(routing: dict) -> str:
    return routing.get("thumbnail", DEFAULT_ROUTING["thumbnail"])
