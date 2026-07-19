"""Local (FFmpeg) motion rendering -- always preferred over fal.ai for
zoom/pan/Ken-Burns/crop (cost-optimization spec, section 8). Pure function:
builds an argv list, never runs the subprocess (that happens at render time).
"""
from pathlib import Path

_MOTION_TYPES = {"static", "ken_burns", "zoom", "pan", "motion_crop"}


def build_motion_command(image_path, motion_type: str, seconds: float, out_path,
                          size: tuple[int, int] = (1080, 1920), fps: int = 30) -> list[str]:
    """FFmpeg argv that turns one keyframe image into a `seconds`-long 9:16
    vertical clip with the requested local motion."""
    if motion_type not in _MOTION_TYPES:
        raise ValueError(
            f"Unknown local motion_type: {motion_type!r} (expected one of {sorted(_MOTION_TYPES)})"
        )

    w, h = size
    frames = max(int(round(seconds * fps)), 1)

    # -framerate pins the looped-image input to exactly `fps`, so `-t
    # seconds` yields exactly `frames` input frames. This matters
    # specifically for zoompan (ken_burns/zoom/pan below): zoompan's `d`
    # parameter is "output frames generated per *input* frame" -- without
    # an explicit input framerate, ffmpeg defaults a piped PNG input to
    # 25fps, so `d=frames` (computed for the *target* fps/duration) would
    # be re-applied on every one of those input frame repeats, multiplying
    # total output frames (and encode time) by the input frame count. Input
    # framerate == fps + d=1 makes each input frame map to exactly one
    # zoompan output frame, so total length is governed purely by the
    # (already frame-accurate) input `-t seconds`.
    cmd = ["ffmpeg", "-y", "-loop", "1", "-framerate", str(fps),
           "-t", str(seconds), "-i", str(image_path)]

    if motion_type == "static":
        vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
    elif motion_type == "ken_burns":
        vf = (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,"
              f"zoompan=z='min(zoom+0.0015,1.3)':d=1:s={w}x{h}:fps={fps}")
    elif motion_type == "zoom":
        vf = (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,"
              f"zoompan=z='min(zoom+0.0025,1.5)':d=1:s={w}x{h}:fps={fps}")
    elif motion_type == "pan":
        # zoompan's x/y expressions see the output frame index as `on`
        # (there is no `n` in that scope) -- `on` ranges 0..frames-1 across
        # the clip, driving a linear left-to-right pan.
        vf = (f"scale={int(w * 1.4)}:{h}:force_original_aspect_ratio=increase,"
              f"zoompan=z='1':x='min(iw-iw/zoom,(iw-ow)*on/{frames})':y='0':"
              f"d=1:s={w}x{h}:fps={fps}")
    else:  # motion_crop
        vf = (f"scale={int(w * 1.3)}:{int(h * 1.3)}:force_original_aspect_ratio=increase,"
              f"crop={w}:{h}:x='(in_w-{w})*t/{seconds}':y='(in_h-{h})/2'")

    cmd += [
        "-vf", vf,
        "-r", str(fps),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-t", str(seconds),  # output-side safety net: exact clip length regardless of filter edge cases
        str(out_path),
    ]
    return cmd
