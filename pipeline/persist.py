"""Persist a validated StoryDoc into Supabase: stories row, scenes rows
(with all decision-engine fields), a pipeline_run, and pipeline_stages for
every stage topic..publish. Uses the service-role client (server-side only).
"""
from app.supabase_client import get_supabase
from pipeline.schema import StoryDoc

STAGES = [
    "topic", "research", "script", "storyboard", "scene_breakdown",
    "character_assignment", "scene_prompt_generation", "keyframe_images",
    "motion_clips", "voice", "background_music", "sound_effects",
    "subtitles", "transitions", "render", "thumbnail", "metadata",
    "human_review", "schedule", "publish",
]

# generate_story() produces one structured document that already covers
# everything through scene-prompt generation in a single call -- those
# stages are done the moment the story is generated; everything from
# keyframe image generation onward is still pending.
_DONE_ON_GENERATE = {
    "topic", "research", "script", "storyboard",
    "scene_breakdown", "character_assignment", "scene_prompt_generation",
}


def persist_story(story_doc: StoryDoc, project_id: str) -> str:
    sb = get_supabase()

    story_row = sb.table("stories").insert({
        "project_id": project_id,
        "topic": story_doc.title,
        "logline": story_doc.logline,
        "moral": story_doc.moral,
        "beat_sheet": {
            "characters_used": story_doc.characters_used,
            "thumbnail_prompt": story_doc.thumbnail_prompt,
            "seo": story_doc.seo.model_dump(),
            "language": story_doc.language,
        },
        "status": "draft",
        "duration_seconds": story_doc.total_seconds,
    }).execute().data
    story_id = story_row[0]["id"]

    for scene in story_doc.scenes:
        sb.table("scenes").insert({
            "story_id": story_id,
            "seq": scene.seq,
            "start_sec": scene.start_sec,
            "end_sec": scene.end_sec,
            "narration": scene.narration,
            "subtitle": scene.subtitle,
            "music_cue": scene.prompt.music_cue,
            "sfx_cue": scene.prompt.sfx_cue,
            "importance": scene.importance,
            "importance_score": scene.importance_score,
            "new_asset_required": scene.new_asset_required,
            "existing_asset_allowed": scene.existing_asset_allowed,
            "recommended_quality": scene.recommended_quality,
            "motion_type": scene.motion_type,
            "animate": scene.motion_type == "ai_animation",
            "prompt": {
                **scene.prompt.model_dump(),
                "asset_query": scene.asset_query,
                "animation_required": scene.animation_required,
            },
        }).execute()

    run_row = sb.table("pipeline_runs").insert({
        "story_id": story_id,
        "status": "running",
        "current_stage": "keyframe_images",
    }).execute().data
    run_id = run_row[0]["id"]

    for seq, stage in enumerate(STAGES):
        sb.table("pipeline_stages").insert({
            "run_id": run_id,
            "stage": stage,
            "seq": seq,
            "status": "done" if stage in _DONE_ON_GENERATE else "pending",
        }).execute()

    return story_id
