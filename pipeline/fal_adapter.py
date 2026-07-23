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


def _subscribe(model_id: str, arguments: dict) -> dict:
    """Thin, monkeypatchable wrapper over fal_client.subscribe. Lazy import so
    the dry/mock path never needs fal_client installed."""
    import fal_client

    return fal_client.subscribe(model_id, arguments=arguments)


def _download_bytes(url: str) -> bytes:
    """Thin, monkeypatchable wrapper that fetches a produced asset URL."""
    import httpx

    return httpx.get(url, timeout=120).content


_PROMPT_SUFFIX = "cinematic, vertical 9:16, high detail, sharp focus"

IMAGE_SIZE = {"width": 1080, "height": 1920}  # vertical 9:16


def _build_prompt(prompt) -> str:
    """Compose a single fal.ai prompt string from a scene prompt (dict) or an
    already-built prompt (str)."""
    if isinstance(prompt, str):
        return prompt
    prompt = prompt or {}
    parts = [prompt.get("subject") or prompt.get("asset_query") or ""]
    if prompt.get("style"):
        parts.append(str(prompt["style"]))
    if prompt.get("character_reference"):
        parts.append(f"consistent character: {prompt['character_reference']}")
    parts.append(_PROMPT_SUFFIX)
    return ", ".join(p for p in parts if p)


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

    routing = (project or {}).get("model_routing") or {}
    model_id = image_model(routing, quality)
    prompt_text = _build_prompt(prompt)
    arguments = {
        "prompt": prompt_text,
        "image_size": IMAGE_SIZE,
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


def generate_motion(image_url: str, tier: str, project, dry: bool = True) -> dict[str, Any]:
    """Generate a short image-to-video motion clip. dry=True: $0, no network call."""
    if dry:
        return {
            "id": None,
            "kind": "motion",
            "storage_path": f"mock://motion/{tier.lower()}/{hash(image_url) & 0xFFFFFFFF:x}.mp4",
            "meta": {"source_image": image_url, "tier": tier, "dry_run": True},
            "cost_usd": 0.0,
        }
    import fal_client  # noqa: F401

    raise NotImplementedError(
        "Real fal.ai motion generation is not wired up in Phase 1 (dry-run only)."
    )
