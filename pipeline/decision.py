"""Scene Decision Engine -- the routing contract from the cost-optimization
spec (section 4). Pure and testable: takes already-loaded collaborators
(asset_lib, cache, governor) and never touches Supabase/network itself.

for scene in scenes:
    if existing_asset_allowed:
        hit = asset_library.search(scene.asset_query, character_id, threshold=0.82)
        if hit: scene.keyframe = hit; continue           # 0 cost
    cache = prompt_cache.get(hash(scene.prompt))
    if cache: scene.keyframe = cache.asset; continue      # 0 cost
    if new_asset_required:
        model = MODEL_ROUTING[scene.recommended_quality]
        scene.keyframe = fal.generate(model, scene.prompt)
        prompt_cache.put(hash(scene.prompt), scene.keyframe)
    # motion:
    if scene.motion_type == "ai_animation" and animation_required and importance == HIGH:
        scene.motion = fal.i2v(MODEL_ROUTING["motion"], scene.keyframe)
    else:
        scene.motion = ffmpeg_motion(scene.keyframe, scene.motion_type)  # local, free
"""
from pipeline.model_routing import (
    DEFAULT_ROUTING,
    IMAGE_COST_ESTIMATE,
    MOTION_COST_ESTIMATE,
    image_model,
    motion_model,
)
from pipeline.prompt_cache import cache_key


def _as_dict(obj) -> dict:
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    return dict(obj)


def _project_id(project) -> str | None:
    if isinstance(project, dict):
        return project.get("id")
    return getattr(project, "id", None)


def _routing(project) -> dict:
    if isinstance(project, dict):
        return project.get("model_routing", DEFAULT_ROUTING)
    return getattr(project, "model_routing", DEFAULT_ROUTING)


def reprice_as_generate(plan: dict, scene, project, governor) -> dict:
    """Turn a reuse plan into a generate plan, at the real price.

    A reuse is only free while the asset it points at still EXISTS. When the
    row survives but its file doesn't -- a worker redeployed without a
    persistent volume, a reclaimed scratch directory -- the pipeline generates
    instead, and that generation costs real money. Leaving the plan as
    `reuse_asset` charges the governor $0 for a paid call, so the per-video cap
    would be enforced against a number that excludes it, and the caller's
    `image_action == "generate"` guard would skip recording the new asset, so
    the miss would repeat on every future run.

    Pricing lives here, next to `plan_scene`'s generate branch, so the two can
    never drift apart.
    """
    scene = _as_dict(scene)
    quality = scene.get("recommended_quality", "Medium")
    cost = IMAGE_COST_ESTIMATE.get(quality, IMAGE_COST_ESTIMATE["Medium"])
    if not governor.can_afford(cost):
        quality = governor.downgrade_quality(quality)
        cost = IMAGE_COST_ESTIMATE.get(quality, IMAGE_COST_ESTIMATE["Low"])

    plan["image_action"] = "generate"
    plan["image_model"] = image_model(_routing(project), quality)
    plan["image_cost"] = cost
    governor.add(cost)
    return plan


def plan_scene(scene, project, asset_lib, cache, governor) -> dict:
    """Decide, for one scene, how the keyframe image and its motion clip
    should be produced. Returns an action plan dict with estimated costs
    and chosen models -- never calls fal.ai itself."""
    scene = _as_dict(scene)
    project_id = _project_id(project)
    routing = _routing(project)
    prompt = scene.get("prompt")
    prompt_dict = _as_dict(prompt) if prompt is not None else {}

    plan = {
        "seq": scene.get("seq"),
        "importance": scene.get("importance"),
        "image_action": None,     # reuse_asset | reuse_cache | generate | skip
        "image_cost": 0.0,
        "image_model": None,
        "image_asset_id": None,
        "motion_action": None,    # ai_animation | local_ffmpeg
        "motion_cost": 0.0,
        "motion_model": None,
        "motion_tier": None,
        "motion_type": scene.get("motion_type"),
    }

    # --- image: asset library reuse (free) ---
    hit = None
    if scene.get("existing_asset_allowed"):
        hit = asset_lib.search(
            scene.get("asset_query", ""), project_id,
            character_id=scene.get("character_id"), threshold=0.82,
        )

    key = cache_key(prompt_dict, image_model(routing, scene.get("recommended_quality", "Medium")))

    if hit is not None:
        plan["image_action"] = "reuse_asset"
        plan["image_asset_id"] = hit.get("id") if isinstance(hit, dict) else getattr(hit, "id", None)
        plan["image_cost"] = 0.0
    else:
        cached = cache.get(key)
        if cached:
            plan["image_action"] = "reuse_cache"
            plan["image_asset_id"] = cached.get("asset_id") if isinstance(cached, dict) else None
            plan["image_cost"] = 0.0
        elif scene.get("new_asset_required"):
            quality = scene.get("recommended_quality", "Medium")
            cost = IMAGE_COST_ESTIMATE.get(quality, IMAGE_COST_ESTIMATE["Medium"])
            if not governor.can_afford(cost):
                quality = governor.downgrade_quality(quality)
                cost = IMAGE_COST_ESTIMATE.get(quality, IMAGE_COST_ESTIMATE["Low"])
            plan["image_action"] = "generate"
            plan["image_model"] = image_model(routing, quality)
            plan["image_cost"] = cost
            governor.add(cost)
            cache.put(key, "image", plan["image_model"], None, prompt_dict)
        else:
            plan["image_action"] = "skip"

    # --- motion: real AI image-to-video for EVERY scene that asks for it and
    # still fits the budget; local FFmpeg motion (free) only once the budget is
    # spent. Previously this was gated to importance=="HIGH", so at most 1-2
    # scenes ever animated and the rest were static ken-burns — the video
    # looked like a slideshow. Now animation is the default for animated scenes
    # and the budget (not importance) decides how many the video can afford. ---
    motion_type = scene.get("motion_type")
    wants_animation = motion_type == "ai_animation" and scene.get("animation_required")
    if wants_animation:
        # Cheaper tiers animate MORE scenes within the same budget; the project's
        # motion tier picks the quality/cost trade-off (default "standard").
        tier = scene.get("motion_tier") or "standard"
        if tier not in MOTION_COST_ESTIMATE:
            tier = "standard"
        cost = MOTION_COST_ESTIMATE[tier]
        if governor.can_afford(cost):
            plan["motion_action"] = "ai_animation"
            plan["motion_model"] = motion_model(routing, tier)
            plan["motion_cost"] = cost
            plan["motion_type"] = "ai_animation"
            plan["motion_tier"] = tier
            governor.add(cost)
        else:
            plan["motion_action"] = "local_ffmpeg"
            plan["motion_type"] = governor.downgrade_motion_type(motion_type)
            plan["motion_cost"] = 0.0
    else:
        plan["motion_action"] = "local_ffmpeg"
        plan["motion_cost"] = 0.0

    return plan
