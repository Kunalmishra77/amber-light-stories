import json
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Warm "amber light" placeholder palette until a real image source is wired.
_TOP = (28, 18, 46)      # deep violet
_BOTTOM = (196, 106, 32)  # amber


def _gradient(size) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(_TOP[0] + (_BOTTOM[0] - _TOP[0]) * t)
        g = int(_TOP[1] + (_BOTTOM[1] - _TOP[1]) * t)
        b = int(_TOP[2] + (_BOTTOM[2] - _TOP[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def _font(px_size: int):
    custom = Path(__file__).parent / "fonts"
    for f in sorted(custom.glob("*.ttf")):
        return ImageFont.truetype(str(f), px_size)
    return ImageFont.load_default(size=px_size)


def make_still(text: str, out_path: Path, size=(1920, 1080)) -> Path:
    img = _gradient(size)
    draw = ImageDraw.Draw(img)
    excerpt = textwrap.fill(text[:220], width=42)
    draw.multiline_text((size[0] // 2, size[1] // 2), excerpt, font=_font(52),
                        fill=(245, 235, 220), anchor="mm", align="center", spacing=14)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")
    return out_path


def make_thumbnail(title: str, out_path: Path) -> Path:
    size = (1280, 720)
    img = _gradient(size)
    draw = ImageDraw.Draw(img)
    wrapped = textwrap.fill(title[:80], width=20)
    draw.multiline_text((size[0] // 2, size[1] // 2), wrapped, font=_font(72),
                        fill=(255, 244, 224), anchor="mm", align="center", spacing=10)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")
    return out_path


def probe_audio_duration(audio_path) -> float:
    """Return audio duration in seconds via ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", str(audio_path)],
        check=True, capture_output=True, text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def build_kenburns_command(image_paths: list[Path], audio_path: Path, out_path: Path,
                           seconds_per_image: int = 8, fps: int = 30) -> list[str]:
    """ffmpeg argv: slow zoom (Ken Burns) per still, concat, narration audio."""
    cmd = ["ffmpeg", "-y"]
    for img in image_paths:
        cmd += ["-loop", "1", "-t", str(seconds_per_image), "-i", str(img)]
    cmd += ["-i", str(audio_path)]

    frames = seconds_per_image * fps
    parts = []
    for i in range(len(image_paths)):
        parts.append(
            f"[{i}:v]scale=1920:1080,"
            f"zoompan=z='min(zoom+0.0009,1.15)':d={frames}:s=1920x1080:fps={fps}[v{i}]"
        )
    concat_in = "".join(f"[v{i}]" for i in range(len(image_paths)))
    parts.append(f"{concat_in}concat=n={len(image_paths)}:v=1:a=0[v]")

    cmd += [
        "-filter_complex", ";".join(parts),
        "-map", "[v]", "-map", f"{len(image_paths)}:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
        "-movflags", "+faststart", "-shortest",
        str(out_path),
    ]
    return cmd
