"""fal.ai adapter -- the ONLY module allowed to call fal.ai, and only for
genuinely new pixels (cost-optimization spec, section 2/9). Every call goes
through a stable interface (`generate_image`, `generate_motion`) so the
concrete model always comes from routing config, and swapping providers
later is an adapter change, not a pipeline rewrite.

`dry=True` (the default, and the ONLY path exercised anywhere in this repo's
tests / dry-run) returns a deterministic placeholder asset dict and makes
NO network call whatsoever. The real path is written but never imported or
invoked here -- fal_client is only ever imported lazily, inside `dry=False`.
"""
from typing import Any

from pipeline import formats


def _subscribe(model_id: str, arguments: dict) -> dict:
    """Thin, monkeypatchable wrapper over fal_client.subscribe. Lazy import so
    the dry/mock path never needs fal_client installed."""
    import fal_client

    return fal_client.subscribe(model_id, arguments=arguments)


def _download_bytes(url: str) -> bytes:
    """Thin, monkeypatchable wrapper that fetches a produced asset URL.
    Follows redirects and raises on any non-2xx status so a bad CDN response
    never gets written to disk as a corrupt image."""
    import httpx

    response = httpx.get(url, timeout=120, follow_redirects=True)
    response.raise_for_status()
    return response.content


def _upload_file(path: str) -> str:
    """Thin, monkeypatchable wrapper over fal_client.upload_file. Uploads a
    local file to fal storage and returns a public URL for use as image_url."""
    import fal_client

    return fal_client.upload_file(path)


_MOTION_PROMPT = (
    "the subject moves naturally with lifelike motion, expressive gestures and "
    "changing facial expression; the environment is alive with motion — moving "
    "clouds, swaying trees, drifting light, ambient particles; dynamic cinematic "
    "camera movement, smooth and continuous"
)

_PROMPT_QUALITY = "cinematic, high detail, sharp focus"

# Vertical, unless the project says otherwise. Kept for callers that don't
# carry a project format; pipeline.formats is the source of truth.
IMAGE_SIZE = {"width": 1080, "height": 1920}  # vertical 9:16


def _build_prompt(prompt, aspect_ratio: str | None = None) -> str:
    """Compose a single fal.ai prompt string from a scene prompt (dict) or an
    already-built prompt (str).

    Every descriptive field the planner produced is used, not just `subject`.
    The scene planner writes `topic`, `environment`, `camera`, `lighting` and
    `emotion`; before this only `subject`/`asset_query` were read, so a scene
    with a rich environment but no explicit subject reached fal as essentially
    nothing — "cinematic, vertical, high detail" with no actual subject — and
    the model invented an unrelated picture. Now the topic anchors the frame
    and the environment/camera/lighting/emotion shape it.

    The framing is part of the PROMPT, not just the output size: asking for a
    landscape composition and then emitting it at 1080x1920 crops heads off.
    """
    if isinstance(prompt, str):
        return prompt
    prompt = prompt or {}

    parts: list[str] = []
    # The concrete thing to depict: an explicit subject wins; otherwise the
    # scene's environment, always anchored to the video's topic so every frame
    # stays on-subject.
    subject = prompt.get("subject") or prompt.get("asset_query")
    topic = prompt.get("topic")
    environment = prompt.get("environment")
    if subject:
        parts.append(str(subject))
        if topic and str(topic).lower() not in str(subject).lower():
            parts.append(str(topic))
    else:
        if topic:
            parts.append(str(topic))
        if environment:
            parts.append(str(environment))

    for key in ("emotion", "camera", "lighting"):
        val = prompt.get(key)
        if val:
            parts.append(str(val))
    if prompt.get("style"):
        parts.append(str(prompt["style"]))
    if prompt.get("character_reference"):
        parts.append(f"consistent character: {prompt['character_reference']}")
    parts.append(formats.orientation_phrase(aspect_ratio))
    parts.append(_PROMPT_QUALITY)

    seen: set[str] = set()
    out: list[str] = []
    for p in parts:
        p = p.strip()
        if p and p.lower() not in seen:
            seen.add(p.lower())
            out.append(p)
    return ", ".join(out)


def generate_image(prompt: dict, quality: str, project, dry: bool = True) -> dict[str, Any]:
    """Generate one keyframe image. dry=True: $0, no network call."""
    if dry:
        return {
            "id": None,
            "kind": "keyframe",
            "storage_path": f"mock://keyframe/{quality.lower()}/{hash(str(prompt)) & 0xFFFFFFFF:x}.png",
            "meta": {"prompt": prompt, "quality": quality, "dry_run": True},
            "cost_usd": 0.0,
        }
    # Real path -- never exercised in tests or the dry-run. Requires
    # FAL_KEY in the environment; lazy import so fal_client need not be
    # installed for the mock/dry-run path to work.
    from pipeline.model_routing import IMAGE_COST_ESTIMATE, image_model

    project = project or {}
    routing = project.get("model_routing") or {}
    model_id = image_model(routing, quality)

    # The project's frame, falling back to its aspect ratio, then to vertical.
    frame = project.get("frame_size")
    if frame:
        image_size = {"width": int(frame[0]), "height": int(frame[1])}
    elif project.get("aspect_ratio"):
        w, h = formats.frame_size(project["aspect_ratio"])
        image_size = {"width": w, "height": h}
    else:
        image_size = IMAGE_SIZE

    prompt_text = _build_prompt(
        prompt,
        project.get("aspect_ratio")
        or formats.aspect_for_size((image_size["width"], image_size["height"])),
    )
    arguments = {
        "prompt": prompt_text,
        "image_size": image_size,
        "num_images": 1,
        "output_format": "png",
        "enable_safety_checker": True,
    }
    seed = prompt.get("seed") if isinstance(prompt, dict) else None
    if seed is not None:
        arguments["seed"] = int(seed)

    result = _subscribe(model_id, arguments)
    images = result.get("images") or []
    if not images:
        raise RuntimeError(f"fal.ai returned no image for model {model_id}")

    data = _download_bytes(images[0]["url"])
    nsfw = bool((result.get("has_nsfw_concepts") or [False])[0])
    return {
        "bytes": data,
        "cost_usd": IMAGE_COST_ESTIMATE.get(quality, IMAGE_COST_ESTIMATE["Medium"]),
        "meta": {
            "model": model_id,
            "seed": result.get("seed", seed),
            "prompt": prompt_text,
            "nsfw": nsfw,
        },
    }


def generate_motion(image_url: str, tier: str, project, dry: bool = True,
                    motion_prompt: str | None = None) -> dict[str, Any]:
    """Generate a short image-to-video motion clip. dry=True: $0, no network call."""
    if dry:
        return {
            "id": None,
            "kind": "motion",
            "storage_path": f"mock://motion/{tier.lower()}/{hash(image_url) & 0xFFFFFFFF:x}.mp4",
            "meta": {"source_image": image_url, "tier": tier, "dry_run": True},
            "cost_usd": 0.0,
        }
    from pipeline.model_routing import MOTION_COST_ESTIMATE, motion_model

    routing = (project or {}).get("model_routing") or {}
    model_id = motion_model(routing, tier)
    src = image_url
    uploaded_url = src if src.startswith(("http://", "https://")) else _upload_file(src)
    # The scene's own motion direction (what moves, how the camera moves) when
    # the planner supplied it, plus the baseline liveliness cues — so each clip
    # animates its actual content, not a generic "subtle" pan.
    prompt = f"{motion_prompt}. {_MOTION_PROMPT}" if motion_prompt else _MOTION_PROMPT
    arguments = {
        "prompt": prompt,
        "image_url": uploaded_url,
    }
    # Kling i2v accepts a "duration" enum ("5"/"10"); LTX and other models
    # parameterize length differently (LTX: num_frames/frame_rate, default
    # ~5s) and reject an unexpected "duration" arg. Send it only for Kling.
    if "kling" in model_id:
        arguments["duration"] = "5"

    result = _subscribe(model_id, arguments)
    video = result.get("video") or {}
    url = video.get("url")
    if not url:
        raise RuntimeError(f"fal.ai returned no video for model {model_id}")

    data = _download_bytes(url)
    return {
        "bytes": data,
        "cost_usd": MOTION_COST_ESTIMATE.get(tier, MOTION_COST_ESTIMATE["standard"]),
        "meta": {"model": model_id, "tier": tier, "duration": arguments.get("duration", "model-default")},
    }
