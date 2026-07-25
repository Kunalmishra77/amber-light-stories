"""Video shape and per-video budget — the one place both are decided.

Before this module the renderer hardcoded 1080x1920 and a $1.55 cap, while the
client's portal offered an aspect-ratio dropdown and a per-video budget field.
Both settings were silently ignored: a workspace could pick 16:9 and still get
a vertical video. Every module that needs a frame size or a budget now reads it
from here, so a setting can never again exist in the UI without reaching the
render.
"""
from __future__ import annotations

# A workspace may spend LESS than this per video, never more — the product's
# hard promise. A client-supplied budget is clamped to it. Raised to 4.0 so a
# full 8-scene video can animate every scene with the premium Kling v2.5 motion
# model (~$0.45/clip) within a client's chosen budget (e.g. $3.50).
PLATFORM_MAX_BUDGET_USD = 4.0

# What a project gets when it has never set a budget.
DEFAULT_BUDGET_USD = 1.55

DEFAULT_ASPECT = "9:16"

# Frame sizes, all even numbers: H.264's yuv420p chroma subsampling requires
# even dimensions, and ffmpeg fails outright on odd ones.
FRAME_SIZES: dict[str, tuple[int, int]] = {
    "9:16": (1080, 1920),   # Shorts / Reels / TikTok
    "16:9": (1920, 1080),   # standard landscape YouTube
    "1:1": (1080, 1080),    # square social
}

# How the shape is described TO THE IMAGE MODEL. Generating a landscape
# composition and cropping it to vertical decapitates people, so the framing
# has to be part of the prompt, not just the output dimensions.
_ORIENTATION: dict[str, str] = {
    "9:16": "vertical 9:16 portrait framing",
    "16:9": "horizontal 16:9 widescreen framing",
    "1:1": "square 1:1 framing",
}


def normalize_aspect(aspect_ratio: str | None) -> str:
    """Coerce a stored value to a supported ratio, defaulting to vertical."""
    key = (aspect_ratio or "").strip()
    return key if key in FRAME_SIZES else DEFAULT_ASPECT


def frame_size(aspect_ratio: str | None) -> tuple[int, int]:
    """(width, height) in pixels for a stored aspect-ratio value."""
    return FRAME_SIZES[normalize_aspect(aspect_ratio)]


def aspect_for_size(size: tuple[int, int]) -> str:
    """The ratio key a pixel frame corresponds to.

    Lets a caller that only carries dimensions still describe the framing to
    the image model correctly.
    """
    for key, dims in FRAME_SIZES.items():
        if tuple(dims) == tuple(size):
            return key
    width, height = size
    if width > height:
        return "16:9"
    if width < height:
        return "9:16"
    return "1:1"


def orientation_phrase(aspect_ratio: str | None) -> str:
    """The framing instruction to append to an image prompt."""
    return _ORIENTATION[normalize_aspect(aspect_ratio)]


def clamp_budget(value: float | int | str | None) -> float:
    """A project's per-video budget, bounded by the platform's hard ceiling.

    Anything unusable — unset, non-numeric, zero or negative — falls back to
    the default rather than to "unlimited", because the failure mode of a bad
    budget must never be uncapped spend.
    """
    try:
        budget = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return DEFAULT_BUDGET_USD
    if budget <= 0:
        return DEFAULT_BUDGET_USD
    return min(budget, PLATFORM_MAX_BUDGET_USD)


def caption_font_size(size: tuple[int, int]) -> int:
    """Subtitle size that stays legible at any frame shape.

    A fixed 60px reads well on a 1080-wide vertical frame and looks like fine
    print on a 1920-wide landscape one. Scaling off the SHORTER side keeps the
    text the same proportion of the visible area in every format.
    """
    return max(28, round(min(size) * 0.056))
