"""Final 9:16 assembly -- concatenate the per-scene motion clips, mux the
narration audio track, optionally burn subtitles and mix in background
music, and output a single H.264/AAC vertical mp4. Always LOCAL FFmpeg:
real, deterministic, $0 -- no paid API involved anywhere in this module.

`build_render_command` is a pure function (argv list in, no subprocess call)
so it is fully unit-testable; `render_video` is the thin runner around it.
"""
import subprocess
from pathlib import Path

from pipeline import formats
from pipeline.translit import to_hinglish, has_devanagari
from media.render import probe_audio_duration  # reuse the existing ffprobe helper

SIZE = (1080, 1920)
FPS = 30

# Font candidates for drawtext, in priority order. drawtext falls back to
# libfontconfig to resolve a bare family name, but a headless/CI box often
# has no fontconfig config at all -- that makes ffmpeg abort (or, on some
# builds, crash) as soon as a subtitle cue is burned in. Pointing drawtext
# at an explicit `fontfile` sidesteps fontconfig entirely.
_FONT_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "media" / "fonts",  # project fonts, if any
    Path("C:/Windows/Fonts/arial.ttf"),
    Path("C:/Windows/Fonts/segoeui.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
]


def _default_font_file() -> str | None:
    for candidate in _FONT_CANDIDATES:
        if candidate.is_dir():
            matches = sorted(candidate.glob("*.ttf"))
            if matches:
                return str(matches[0])
        elif candidate.is_file():
            return str(candidate)
    return None


def _escape_filter_path(path: str) -> str:
    """Escape a filesystem path for use as an FFmpeg filter option value
    (e.g. drawtext's fontfile=...) -- forward slashes avoid Windows
    backslash-escaping headaches, and a drive-letter colon still needs
    escaping."""
    return str(path).replace("\\", "/").replace(":", "\\:")


def _escape_drawtext(text: str) -> str:
    """Escape a subtitle line for FFmpeg's drawtext filter (single-quoted
    text argument)."""
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "’")  # curly apostrophe -- avoids quote-escaping edge cases
        .replace("%", "\\%")
    )


def build_render_command(scene_clips: list, audio_path, out_path,
                          subtitles: list[tuple[float, float, str]] | None = None,
                          music_path=None, size: tuple[int, int] = SIZE,
                          fps: int = FPS, duration: float | None = None,
                          clip_durations: list[float] | None = None) -> list[str]:
    """Build the ffmpeg argv for the final render. Pure -- never runs
    anything.

    - concatenates `scene_clips` (already-rendered per-scene mp4s) after
      normalizing each to `size`/`fps`/yuv420p
    - maps the narration audio (`audio_path`) as the output audio track,
      optionally ducked-mixed with `music_path`
    - optionally burns `subtitles` (list of (start_sec, end_sec, text)) via
      chained drawtext filters, one cue at a time
    - outputs 1080x1920 H.264 + AAC with faststart. When `duration` is given
      (render_video passes the narration's real ffprobe'd duration -- see
      `probe_audio_duration`), the output is trimmed/padded to exactly that
      length so the final video length matches the audio; otherwise falls
      back to `-shortest` (whichever of video/audio ends first).
    """
    if not scene_clips:
        raise ValueError("render_video requires at least one scene clip")

    w, h = size
    cmd = ["ffmpeg", "-y"]
    for clip in scene_clips:
        cmd += ["-i", str(clip)]
    cmd += ["-i", str(audio_path)]
    audio_idx = len(scene_clips)

    music_idx = None
    if music_path:
        cmd += ["-i", str(music_path)]
        music_idx = audio_idx + 1

    filters = []
    v_labels = []
    for i in range(len(scene_clips)):
        lbl = f"v{i}"
        base = (
            f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},fps={fps},format=yuv420p,setsar=1"
        )
        # Force this scene's clip to its narration length so audio and video
        # stay locked: hold the last frame if the line runs longer than the
        # 5-second motion clip, cut it if the line is shorter. Padding a fixed
        # generous buffer then trimming to the exact duration handles both.
        if clip_durations is not None and i < len(clip_durations):
            d = max(0.1, float(clip_durations[i]))
            base += (
                f",tpad=stop_mode=clone:stop_duration=20,"
                f"trim=duration={d:.3f},setpts=PTS-STARTPTS"
            )
        filters.append(f"{base}[{lbl}]")
        v_labels.append(f"[{lbl}]")
    filters.append("".join(v_labels) + f"concat=n={len(scene_clips)}:v=1:a=0[vcat]")

    font_file = _default_font_file()
    font_opt = f"fontfile='{_escape_filter_path(font_file)}':" if font_file else ""

    # Captions scale with the frame. A fixed 60px and a fixed 320px offset were
    # tuned for 1080x1920; on a 1920x1080 landscape frame the same numbers read
    # as fine print sitting almost off the bottom edge.
    font_px = formats.caption_font_size((w, h))
    baseline = round(h * 0.1667)
    border = max(6, round(font_px * 0.3))

    cur = "vcat"
    for i, (start, end, text) in enumerate(subtitles or []):
        nxt = f"sub{i}"
        # Burn captions in Roman (Hinglish): ffmpeg's drawtext has no Indic
        # shaping, so Devanagari conjuncts/matras render wrong. The narration
        # audio is untouched — only the on-screen text is transliterated.
        caption = to_hinglish(text) if has_devanagari(text) else text
        safe = _escape_drawtext(caption)
        filters.append(
            f"[{cur}]drawtext={font_opt}text='{safe}':fontcolor=white:fontsize={font_px}:"
            f"box=1:boxcolor=black@0.55:boxborderw={border}:x=(w-text_w)/2:y=h-{baseline}:"
            f"enable='between(t,{start},{end})'[{nxt}]"
        )
        cur = nxt
    video_map = f"[{cur}]"

    if music_idx is not None:
        filters.append(f"[{audio_idx}:a]volume=1.0[narr]")
        filters.append(f"[{music_idx}:a]volume=0.15[music]")
        filters.append("[narr][music]amix=inputs=2:duration=first:dropout_transition=2[aout]")
        audio_map = "[aout]"
    else:
        audio_map = f"{audio_idx}:a"

    cmd += [
        "-filter_complex", ";".join(filters),
        "-map", video_map,
        "-map", audio_map,
        "-r", str(fps),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-movflags", "+faststart",
    ]
    cmd += ["-t", str(duration)] if duration is not None else ["-shortest"]
    cmd += [str(out_path)]
    return cmd


def render_video(scene_clips: list, audio_path, out_path,
                  subtitles: list[tuple[float, float, str]] | None = None,
                  music_path=None, size: tuple[int, int] = SIZE, fps: int = FPS,
                  clip_durations: list[float] | None = None) -> Path:
    """Run the final render and return `out_path`. Real FFmpeg subprocess,
    local, $0.

    When `clip_durations` is given, each scene's clip is stretched/trimmed to
    its own narration length so picture and sound stay locked. Otherwise probes
    the narration track's real duration and trims the whole output to it."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        duration = probe_audio_duration(audio_path)
    except Exception:
        duration = None
    cmd = build_render_command(scene_clips, audio_path, out_path, subtitles=subtitles,
                                music_path=music_path, size=size, fps=fps, duration=duration,
                                clip_durations=clip_durations)
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path


__all__ = ["build_render_command", "render_video", "probe_audio_duration", "SIZE", "FPS"]
