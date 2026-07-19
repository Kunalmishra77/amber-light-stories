"""Tests for pipeline.render -- the final 9:16 assembly. `build_render_command`
is pure (argv-building only) and is unit-tested directly; ONE integration
smoke test actually runs FFmpeg on tiny generated stills + a silent audio
track to produce a real short mp4 -- local, $0, no paid API involved.
"""
import subprocess

import pytest

from pipeline import render


def test_build_render_command_structure(tmp_path):
    clips = [tmp_path / "s0.mp4", tmp_path / "s1.mp4", tmp_path / "s2.mp4"]
    audio = tmp_path / "voice.m4a"
    out = tmp_path / "final.mp4"

    cmd = render.build_render_command(clips, audio, out)

    assert cmd[0] == "ffmpeg"
    assert cmd[-1] == str(out)
    assert cmd.count("-i") == 4  # 3 clips + 1 audio track
    assert "libx264" in cmd
    assert "aac" in cmd
    assert "1080:1920" in " ".join(cmd) or "1080" in " ".join(cmd)

    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "concat=n=3:v=1:a=0" in fc

    assert "-map" in cmd
    map_values = [cmd[i + 1] for i, a in enumerate(cmd) if a == "-map"]
    assert any(v.startswith("[") for v in map_values)  # video map is a filter label
    assert "3:a" in map_values  # audio input is the 4th input (index 3)


def test_build_render_command_burns_subtitles(tmp_path):
    clips = [tmp_path / "s0.mp4"]
    audio = tmp_path / "voice.m4a"
    subtitles = [(0.0, 3.0, "A proud lion ruled the jungle.")]

    cmd = render.build_render_command(clips, audio, tmp_path / "final.mp4", subtitles=subtitles)

    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "drawtext" in fc
    assert "A proud lion ruled the jungle." in fc
    assert "between(t,0.0,3.0)" in fc


def test_build_render_command_mixes_music_when_provided(tmp_path):
    clips = [tmp_path / "s0.mp4"]
    audio = tmp_path / "voice.m4a"
    music = tmp_path / "music.mp3"

    cmd = render.build_render_command(clips, audio, tmp_path / "final.mp4", music_path=music)

    assert cmd.count("-i") == 3  # clip + voice + music
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "amix" in fc
    map_values = [cmd[i + 1] for i, a in enumerate(cmd) if a == "-map"]
    assert "[aout]" in map_values


def test_build_render_command_rejects_empty_clip_list(tmp_path):
    with pytest.raises(ValueError):
        render.build_render_command([], tmp_path / "voice.m4a", tmp_path / "final.mp4")


def test_render_video_invokes_ffmpeg_subprocess(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(render.subprocess, "run", lambda cmd, **kw: calls.append(cmd))

    clips = [tmp_path / "s0.mp4"]
    out = tmp_path / "out" / "final.mp4"
    result = render.render_video(clips, tmp_path / "voice.m4a", out)

    assert result == out
    assert out.parent.is_dir()  # parent directory created
    # render_video probes the audio duration (ffprobe) before running the
    # actual ffmpeg render command; the probe fails gracefully here (the
    # patched subprocess.run returns None, not a real ffprobe result) and
    # render_video falls back to building the command without an explicit
    # duration, but the render call itself still happens.
    ffmpeg_calls = [c for c in calls if c[0] == "ffmpeg"]
    assert len(ffmpeg_calls) == 1


def test_render_video_aligns_duration_to_probed_audio_length(tmp_path, monkeypatch):
    monkeypatch.setattr(render, "probe_audio_duration", lambda path: 12.5)
    ffmpeg_calls = []
    monkeypatch.setattr(render.subprocess, "run", lambda cmd, **kw: ffmpeg_calls.append(cmd))

    clips = [tmp_path / "s0.mp4"]
    render.render_video(clips, tmp_path / "voice.m4a", tmp_path / "final.mp4")

    assert len(ffmpeg_calls) == 1
    cmd = ffmpeg_calls[0]
    assert "-t" in cmd
    assert cmd[cmd.index("-t") + 1] == "12.5"
    assert "-shortest" not in cmd


# --------------------------------------------------------------------------
# integration smoke test: a REAL small mp4, built from real local stills +
# a real silent audio track, via real FFmpeg. Local, deterministic, $0.
# --------------------------------------------------------------------------

def test_real_render_smoke_produces_a_playable_vertical_mp4(tmp_path):
    from pipeline import executors

    scene0 = {"seq": 0, "start_sec": 0, "end_sec": 1, "motion_type": "static", "animate": False,
              "prompt": {"subject": "A quiet jungle clearing at dawn"}}
    scene1 = {"seq": 1, "start_sec": 1, "end_sec": 2, "motion_type": "ken_burns", "animate": False,
              "prompt": {"subject": "A clever rabbit sitting by a well"}}

    clips = []
    for scene in (scene0, scene1):
        kf = executors.execute_keyframe(scene, tmp_path / f"kf{scene['seq']}.png")
        clip = executors.execute_motion(scene, kf, tmp_path / f"motion{scene['seq']}.mp4",
                                         seconds=1.0)
        clips.append(clip)

    voice_path, duration = executors.execute_voice("A short two second test narration.",
                                                     tmp_path / "voice.m4a")
    assert duration > 0

    out = tmp_path / "final.mp4"
    result = render.render_video(clips, voice_path, out,
                                  subtitles=[(0.0, 1.0, "Dawn."), (1.0, 2.0, "The rabbit waits.")])

    assert result.is_file()
    assert result.stat().st_size > 0

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", str(result)],
        check=True, capture_output=True, text=True,
    )
    width, height = (int(x) for x in probe.stdout.strip().split(","))
    assert (width, height) == (1080, 1920)
