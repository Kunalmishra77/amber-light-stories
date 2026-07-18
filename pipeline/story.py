"""Story generation -- the ONE structured OpenAI call per story (cost-
optimization spec, section 2): research + logline + script + scene
breakdown + per-scene prompts + animation/camera instructions + thumbnail
prompt + SEO, all in a single JSON document.

mock=True (used everywhere in tests and pipeline.dryrun) returns a fully
populated, deterministic sample and makes NO API call at all.
"""
import json

from ai.llm.router import route
from ai.prompts import load_prompt
from app.supabase_client import get_supabase
from pipeline.schema import StoryDoc


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _mock_story_doc() -> dict:
    """Deterministic English-narrated Indian Panchatantra-style fable: "The
    Clever Rabbit and the Lion" -- 6 scenes, ~45s, realistic decision
    metadata (hero + climax = HIGH/ai_animation, mid beats = MEDIUM/
    ken_burns, backgrounds = LOW/existing_asset_allowed). The story stays an
    Indian moral fable (Indian jungle setting, Indian characters); only the
    narration/subtitle language is English, for an international audience."""
    return {
        "title": "The Clever Rabbit and the Lion",
        "logline": "A proud lion terrorizes the animals of an Indian jungle, until a clever rabbit named Meera outwits him with her wit alone.",
        "moral": "Wisdom is mightier than strength.",
        "language": "en",
        "total_seconds": 45,
        "characters_used": ["Host (You)", "Meera"],
        "scenes": [
            {
                "seq": 0, "start_sec": 0, "end_sec": 7,
                "narration": "Deep in an Indian jungle, a proud lion ruled by fear, terrorizing every animal.",
                "subtitle": "A proud lion ruled the jungle by fear.",
                "importance": "HIGH", "importance_score": 0.95,
                "new_asset_required": True, "existing_asset_allowed": False,
                "animation_required": True, "recommended_quality": "High",
                "motion_type": "ai_animation",
                "asset_query": "proud lion jungle hero shot rocky outcrop",
                "prompt": {
                    "subject": "A magnificent golden-maned lion standing atop a rocky outcrop",
                    "environment": "Dense green Indian jungle at golden hour, ancient banyan trees",
                    "camera": "Wide establishing hero shot, low angle",
                    "lens": "24mm wide-angle",
                    "lighting": "Warm golden-hour rim light",
                    "color_grade": "Warm amber cinematic grade",
                    "expression": "Fierce, commanding",
                    "emotion": "Dread, awe",
                    "motion_direction": "Slow push-in as the lion turns its head toward camera",
                    "sfx_cue": "Low rumble, distant roar",
                    "music_cue": "Ominous orchestral swell",
                },
            },
            {
                "seq": 1, "start_sec": 7, "end_sec": 14,
                "narration": "In that same jungle lived a small but remarkably clever rabbit named Meera.",
                "subtitle": "A clever rabbit named Meera lived nearby.",
                "importance": "MEDIUM", "importance_score": 0.6,
                "new_asset_required": True, "existing_asset_allowed": True,
                "animation_required": False, "recommended_quality": "Medium",
                "motion_type": "ken_burns",
                "asset_query": "rabbit character meera forest closeup",
                "prompt": {
                    "subject": "A small clever rabbit with bright alert eyes, sitting near a burrow",
                    "environment": "Sunlit forest clearing, dew on grass",
                    "camera": "Medium close-up, eye-level",
                    "lens": "50mm",
                    "lighting": "Soft morning light",
                    "color_grade": "Warm green-amber",
                    "expression": "Curious, sharp-eyed smile",
                    "emotion": "Quiet confidence",
                    "motion_direction": "Gentle ear twitch, head tilt",
                    "sfx_cue": "Birdsong, rustling leaves",
                    "music_cue": "Playful light strings",
                },
            },
            {
                "seq": 2, "start_sec": 14, "end_sec": 21,
                "narration": "Every day the lion claimed one animal as his prey, and now it was the rabbit's turn.",
                "subtitle": "Now it was the rabbit's turn.",
                "importance": "LOW", "importance_score": 0.3,
                "new_asset_required": False, "existing_asset_allowed": True,
                "animation_required": False, "recommended_quality": "Low",
                "motion_type": "static",
                "asset_query": "jungle clearing dusk background wide shot",
                "prompt": {
                    "subject": "Frightened forest animals gathered together",
                    "environment": "Same dense jungle clearing, dusk",
                    "camera": "Wide shot",
                    "lens": "35mm",
                    "lighting": "Dim dusky light",
                    "color_grade": "Cool desaturated blue-amber",
                    "expression": "Fearful",
                    "emotion": "Tension, dread",
                    "motion_direction": "Static wide shot with subtle leaf sway",
                    "sfx_cue": "Wind, distant growl",
                    "music_cue": "Tense low drone",
                },
            },
            {
                "seq": 3, "start_sec": 21, "end_sec": 29,
                "narration": "Meera devised a clever plan and deliberately arrived late to meet the lion.",
                "subtitle": "Meera devised a clever plan.",
                "importance": "MEDIUM", "importance_score": 0.6,
                "new_asset_required": True, "existing_asset_allowed": True,
                "animation_required": False, "recommended_quality": "Medium",
                "motion_type": "ken_burns",
                "asset_query": "stone well moss vines forest",
                "prompt": {
                    "subject": "The rabbit walking slowly toward an old stone well, deep in thought",
                    "environment": "Old stone well surrounded by moss and vines",
                    "camera": "Medium tracking shot",
                    "lens": "35mm",
                    "lighting": "Late afternoon dappled light",
                    "color_grade": "Warm earthy tones",
                    "expression": "Determined, thoughtful",
                    "emotion": "Nervous resolve",
                    "motion_direction": "Slow walk toward the well, gentle push-in",
                    "sfx_cue": "Footsteps, faint echo from the well",
                    "music_cue": "Building suspense strings",
                },
            },
            {
                "seq": 4, "start_sec": 29, "end_sec": 38,
                "narration": "Meera showed the lion his own reflection in a well, and in a blind rage, he leapt in.",
                "subtitle": "The furious lion leapt into the well!",
                "importance": "HIGH", "importance_score": 0.95,
                "new_asset_required": True, "existing_asset_allowed": False,
                "animation_required": True, "recommended_quality": "High",
                "motion_type": "ai_animation",
                "asset_query": "lion jumping into well climax action",
                "prompt": {
                    "subject": "The lion roaring and leaping into a stone well after seeing his own reflection",
                    "environment": "Stone well at twilight, water splashing",
                    "camera": "Dynamic low-angle action shot",
                    "lens": "24mm",
                    "lighting": "Dramatic twilight rim light with water-splash highlights",
                    "color_grade": "High-contrast amber-teal cinematic",
                    "expression": "Enraged",
                    "emotion": "Fury turning to shock",
                    "motion_direction": "Lion lunges forward and falls into the well with a splash",
                    "sfx_cue": "Roar, splash, echo",
                    "music_cue": "Dramatic orchestral hit",
                },
            },
            {
                "seq": 5, "start_sec": 38, "end_sec": 45,
                "narration": "All the animals of the jungle rejoiced in their freedom, and the tale of Meera's wisdom spread far and wide.",
                "subtitle": "Wisdom is mightier than strength.",
                "importance": "LOW", "importance_score": 0.3,
                "new_asset_required": False, "existing_asset_allowed": True,
                "animation_required": False, "recommended_quality": "Low",
                "motion_type": "ken_burns",
                "asset_query": "jungle clearing sunrise celebration wide shot",
                "prompt": {
                    "subject": "Forest animals celebrating together at sunrise",
                    "environment": "Same jungle clearing, warm sunrise light",
                    "camera": "Wide celebratory shot, slow pull-back",
                    "lens": "24mm",
                    "lighting": "Bright warm sunrise",
                    "color_grade": "Bright warm golden grade",
                    "expression": "Joyful",
                    "emotion": "Relief, celebration",
                    "motion_direction": "Gentle pull-back reveal",
                    "sfx_cue": "Cheerful chatter, birdsong",
                    "music_cue": "Uplifting resolving theme",
                },
            },
        ],
        "thumbnail_prompt": (
            "Cinematic hero frame: clever rabbit Meera standing confidently before a giant "
            "lion's silhouette reflected in a well, dramatic amber lighting, vertical 9:16 "
            "composition, bold contrast"
        ),
        "seo": {
            "title": "How a Clever Rabbit Outwitted a Proud Lion #Shorts",
            "description": (
                "A proud lion terrorizes the animals of an Indian jungle, until a small but "
                "remarkably clever rabbit named Meera sets them free with her wit alone. An "
                "original story inspired by the Panchatantra, teaching that wisdom is mightier "
                "than strength. Subscribe to Amber Light Stories!"
            ),
            "tags": [
                "panchatantra", "indian moral story", "clever rabbit", "lion story",
                "shorts", "moral stories", "bedtime story",
                "amber light stories", "animated shorts",
            ],
        },
    }


def generate_story(project_id: str, topic: str | None = None, mock: bool = False) -> StoryDoc:
    """Generate the single structured story document for `project_id`.

    mock=True: deterministic sample, ZERO API calls (used in tests and
    pipeline.dryrun). mock=False: builds the prompt from the project's
    config, calls the routed script model, parses + validates the JSON.
    """
    if mock:
        return StoryDoc(**_mock_story_doc())

    sb = get_supabase()
    project = sb.table("projects").select("*").eq("id", project_id).single().execute().data
    characters = (sb.table("characters").select("name,role")
                  .eq("project_id", project_id).execute().data or [])

    niche = project.get("niche") or "Indian moral stories (Panchatantra-style fables)"
    language = project.get("language") or "hi"
    target_seconds = project.get("target_seconds") or 45
    character_names = ", ".join(f"{c['name']} ({c['role']})" for c in characters) or "none yet"
    style = topic or "warm, reflective, gently suspenseful cinematic short-form fable"

    prompt = (
        load_prompt("shortform_story")
        .replace("{niche}", str(niche))
        .replace("{language}", str(language))
        .replace("{target_seconds}", str(target_seconds))
        .replace("{characters}", character_names)
        .replace("{style}", style)
    )

    adapter, model = route("script")
    result = adapter.generate(prompt, model=model)
    data = json.loads(_strip_json_fences(result.text))
    return StoryDoc(**data)
