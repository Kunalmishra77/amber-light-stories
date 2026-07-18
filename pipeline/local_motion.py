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

    cmd = ["ffmpeg", "-y", "-loop", "1", "-t", str(seconds), "-i", str(image_path)]

    if motion_type == "static":
        vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
    elif motion_type == "ken_burns":
        vf = (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,"
              f"zoompan=z='min(zoom+0.0015,1.3)':d={frames}:s={w}x{h}:fps={fps}")
    elif motion_type == "zoom":
        vf = (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,"
              f"zoompan=z='min(zoom+0.0025,1.5)':d={frames}:s={w}x{h}:fps={fps}")
    elif motion_type == "pan":
        vf = (f"scale={int(w * 1.4)}:{h}:force_original_aspect_ratio=increase,"
              f"zoompan=z='1':x='min(iw-iw/zoom,(iw-ow)*n/{frames})':y='0':"
              f"d={frames}:s={w}x{h}:fps={fps}")
    else:  # motion_crop
        vf = (f"scale={int(w * 1.3)}:{int(h * 1.3)}:force_original_aspect_ratio=increase,"
              f"crop={w}:{h}:x='(in_w-{w})*t/{seconds}':y='(in_h-{h})/2'")

    cmd += [
        "-vf", vf,
        "-r", str(fps),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(out_path),
    ]
    return cmd
