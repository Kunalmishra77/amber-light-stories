"""Tests for pipeline.executors -- the per-stage media producers. Mock
(live=False, the default) paths are exercised for real (they're local
Pillow/FFmpeg and cheap); live=True paths are exercised only against
patched adapters so NO network call to fal.ai / ElevenLabs / OpenAI /
Gemini is ever made from this test file.
"""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from pipeline import executors
from pipeline.model_routing import DEFAULT_ROUTING


def _scene(**overrides):
    base = {
        "seq": 0,
        "start_sec": 0.0,
        "end_sec": 6.0,
        "narration": "A quiet clever rabbit outwits a proud lion.",
        "subtitle": "A clever rabbit outwits a lion.",
        "importance": "HIGH",
        "importance_score": 0.9,
        "new_asset_required": True,
        "existing_asset_allowed": False,
        "animation_required": True,
        "recommended_quality": "High",
        "motion_type": "ai_animation",
        "animate": True,
        "asset_query": "lion rabbit hero shot",
        "project_id": "proj-1",
        "prompt": {
            "subject": "A clever rabbit facing a golden-maned lion",
            "environment": "e", "camera": "c", "lens": "l", "lighting": "li",
            "color_grade": "cg", "expression": "ex", "emotion": "em",
            "motion_direction": "md", "sfx_cue": "sfx", "music_cue": "mc",
        },
    }
    base.update(overrides)
    return base


# --------------------------------------------------------------------------
# execute_keyframe
# --------------------------------------------------------------------------

def test_execute_keyframe_mock_writes_vertical_png(tmp_path):
    out = executors.execute_keyframe(_scene(), tmp_path / "kf.png")
    from PIL import Image
    assert out.is_file()
    with Image.open(out) as im:
        assert im.size == (1080, 1920)


def test_execute_keyframe_mock_never_touches_fal_adapter(tmp_path, monkeypatch):
    fake = Mock()
    monkeypatch.setattr(executors.fal_adapter, "generate_image", fake)
    executors.execute_keyframe(_scene(), tmp_path / "kf.png", live=False)
    fake.assert_not_called()


def test_execute_keyframe_live_calls_fal_adapter_with_resolved_model(tmp_path, monkeypatch):
    fake = Mock(return_value={"bytes": b"PNG"})
    monkeypatch.setattr(executors.fal_adapter, "generate_image", fake)

    out = executors.execute_keyframe(_scene(), tmp_path / "kf.png", live=True, routing=DEFAULT_ROUTING)

    fake.assert_called_once()
    prompt_arg, quality_arg, project_arg = fake.call_args.args[0], fake.call_args.args[1], fake.call_args.args[2]
    assert prompt_arg["subject"] == "A clever rabbit facing a golden-maned lion"
    assert quality_arg == "High"
    assert project_arg["model_routing"] == DEFAULT_ROUTING
    assert fake.call_args.kwargs["dry"] is False
    assert out.read_bytes() == b"PNG"


def test_execute_keyframe_live_includes_character_reference_when_present(tmp_path, monkeypatch):
    fake = Mock(return_value={"bytes": b"PNG"})
    monkeypatch.setattr(executors.fal_adapter, "generate_image", fake)

    scene = _scene(character_reference="mock://characters/meera.png")
    executors.execute_keyframe(scene, tmp_path / "kf.png", live=True, routing=DEFAULT_ROUTING)

    prompt_arg = fake.call_args.args[0]
    assert prompt_arg["character_reference"] == "mock://characters/meera.png"


# --------------------------------------------------------------------------
# execute_motion
# --------------------------------------------------------------------------

def test_execute_motion_mock_runs_local_ffmpeg_ken_burns(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(executors.subprocess, "run",
                         lambda cmd, **kw: calls.append(cmd))

    out = executors.execute_motion(_scene(motion_type="ken_burns", animate=False),
                                    tmp_path / "kf.png", tmp_path / "motion.mp4", live=False)

    assert len(calls) == 1
    cmd = calls[0]
    assert cmd[0] == "ffmpeg"
    assert str(out) == cmd[-1]
    joined = " ".join(cmd)
    assert "zoompan" in joined
    assert "1080x1920" in joined


def test_execute_motion_ai_animation_without_live_downgrades_to_local_ken_burns(tmp_path, monkeypatch):
    ffmpeg_calls = []
    fal_motion = Mock()
    monkeypatch.setattr(executors.subprocess, "run",
                         lambda cmd, **kw: ffmpeg_calls.append(cmd))
    monkeypatch.setattr(executors.fal_adapter, "generate_motion", fal_motion)

    executors.execute_motion(_scene(motion_type="ai_animation", animate=True),
                              tmp_path / "kf.png", tmp_path / "motion.mp4", live=False)

    fal_motion.assert_not_called()
    assert len(ffmpeg_calls) == 1
    assert "zoompan" in " ".join(ffmpeg_calls[0])  # ken_burns fallback


def test_execute_motion_live_ai_animation_calls_fal_generate_motion(tmp_path, monkeypatch):
    ffmpeg_calls = []
    fake = Mock(return_value={"bytes": b"MP4"})
    monkeypatch.setattr(executors.subprocess, "run",
                         lambda cmd, **kw: ffmpeg_calls.append(cmd))
    monkeypatch.setattr(executors.fal_adapter, "generate_motion", fake)

    kf = tmp_path / "kf.png"
    kf.write_bytes(b"x")
    out = executors.execute_motion(_scene(motion_type="ai_animation", animate=True),
                                    kf, tmp_path / "motion.mp4", live=True, routing=DEFAULT_ROUTING)

    fake.assert_called_once()
    assert fake.call_args.args[0] == str(kf)
    assert fake.call_args.args[1] == "standard"
    assert fake.call_args.kwargs["dry"] is False
    assert not ffmpeg_calls  # local FFmpeg never invoked on the live AI-animation path
    assert out.read_bytes() == b"MP4"


def test_execute_motion_non_hero_scene_stays_local_even_when_live(tmp_path, monkeypatch):
    """A non-'ai_animation' motion_type always renders locally, live or not."""
    ffmpeg_calls = []
    fal_motion = Mock()
    monkeypatch.setattr(executors.subprocess, "run",
                         lambda cmd, **kw: ffmpeg_calls.append(cmd))
    monkeypatch.setattr(executors.fal_adapter, "generate_motion", fal_motion)

    executors.execute_motion(_scene(motion_type="pan", animate=False),
                              tmp_path / "kf.png", tmp_path / "motion.mp4", live=True)

    fal_motion.assert_not_called()
    assert len(ffmpeg_calls) == 1


# --------------------------------------------------------------------------
# execute_voice
# --------------------------------------------------------------------------

def test_execute_voice_mock_generates_silent_track_of_estimated_duration(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(executors.subprocess, "run",
                         lambda cmd, **kw: calls.append(cmd))

    text = "one two three four five six seven eight nine ten"  # 10 words
    expected = executors.estimate_voice_seconds(text)
    path, duration = executors.execute_voice(text, tmp_path / "voice.m4a", live=False)

    assert duration == expected
    assert len(calls) == 1
    cmd = calls[0]
    joined = " ".join(cmd)
    assert "anullsrc" in joined
    assert str(expected) in cmd


def test_execute_voice_mock_duration_scales_with_word_count():
    short = executors.estimate_voice_seconds("one two")
    long = executors.estimate_voice_seconds(" ".join(["word"] * 50))
    assert long > short
    assert short >= executors.MIN_VOICE_SECONDS


def test_execute_voice_mock_never_touches_elevenlabs(tmp_path, monkeypatch):
    import ai.tts.elevenlabs_adapter as el_mod
    fake_cls = Mock()
    monkeypatch.setattr(el_mod, "ElevenLabsAdapter", fake_cls)
    monkeypatch.setattr(executors.subprocess, "run", lambda cmd, **kw: None)

    executors.execute_voice("hello world", tmp_path / "voice.m4a", live=False)

    fake_cls.assert_not_called()


def test_execute_voice_live_calls_elevenlabs_adapter(tmp_path, monkeypatch):
    import ai.tts.elevenlabs_adapter as el_mod

    synth_calls = []

    class FakeAdapter:
        def synthesize(self, text, out_path):
            synth_calls.append((text, Path(out_path)))
            Path(out_path).write_bytes(b"mp3-bytes")
            return out_path

    monkeypatch.setattr(el_mod, "ElevenLabsAdapter", FakeAdapter)
    monkeypatch.setattr(executors, "_probe_duration", lambda p: 9.87)

    out_path = tmp_path / "voice.m4a"
    path, duration = executors.execute_voice("hello there", out_path, live=True)

    assert synth_calls and synth_calls[0][0] == "hello there"
    assert duration == 9.87
    assert path == out_path


# --------------------------------------------------------------------------
# execute_thumbnail
# --------------------------------------------------------------------------

def test_execute_thumbnail_mock_writes_vertical_png(tmp_path):
    story = SimpleNamespace(title="The Clever Rabbit and the Lion", thumbnail_prompt="p", project_id="proj-1")
    out = executors.execute_thumbnail(story, tmp_path / "thumb.png")
    from PIL import Image
    assert out.is_file()
    with Image.open(out) as im:
        assert im.size == (1080, 1920)


def test_execute_thumbnail_mock_never_touches_fal_adapter(tmp_path, monkeypatch):
    fake = Mock()
    monkeypatch.setattr(executors.fal_adapter, "generate_image", fake)
    story = SimpleNamespace(title="T", thumbnail_prompt="p", project_id="proj-1")
    executors.execute_thumbnail(story, tmp_path / "thumb.png", live=False)
    fake.assert_not_called()


def test_execute_thumbnail_live_calls_fal_adapter(tmp_path, monkeypatch):
    fake = Mock(return_value={"bytes": b"PNG"})
    monkeypatch.setattr(executors.fal_adapter, "generate_image", fake)
    story = SimpleNamespace(title="T", thumbnail_prompt="Cinematic hero frame", project_id="proj-1")

    executors.execute_thumbnail(story, tmp_path / "thumb.png", live=True, routing=DEFAULT_ROUTING)

    fake.assert_called_once()
    assert fake.call_args.args[0]["subject"] == "Cinematic hero frame"
    assert fake.call_args.args[1] == "High"
    assert fake.call_args.kwargs["dry"] is False


# --------------------------------------------------------------------------
# execute_metadata
# --------------------------------------------------------------------------

def test_execute_metadata_mock_returns_deterministic_story_seo():
    from pipeline.story import generate_story
    story = generate_story("proj-1", mock=True)

    result1 = executors.execute_metadata(story, live=False)
    result2 = executors.execute_metadata(story, live=False)

    assert result1 == result2
    assert result1["title"] == story.seo.title
    assert result1["description"] == story.seo.description
    assert result1["tags"] == story.seo.tags


def test_execute_metadata_mock_never_touches_router(monkeypatch):
    import ai.llm.router as router_mod
    from pipeline.story import generate_story

    fake_route = Mock()
    monkeypatch.setattr(router_mod, "route", fake_route)
    story = generate_story("proj-1", mock=True)

    executors.execute_metadata(story, live=False)

    fake_route.assert_not_called()


def test_execute_metadata_live_calls_llm_router(monkeypatch):
    import ai.llm.router as router_mod
    from ai.llm.base import LLMResult
    from pipeline.story import generate_story

    captured_prompts = []

    class FakeAdapter:
        def generate(self, prompt, model=None):
            captured_prompts.append(prompt)
            return LLMResult('{"title": "T", "description": "D", "tags": ["a", "b"]}',
                              "gemini", model or "gemini-flash-latest", 42, 0.0)

    calls = []

    def fake_route(task_type):
        calls.append(task_type)
        return FakeAdapter(), "gemini-flash-latest"

    monkeypatch.setattr(router_mod, "route", fake_route)
    story = generate_story("proj-1", mock=True)

    result = executors.execute_metadata(story, live=True)

    assert calls == ["seo"]
    assert result == {"title": "T", "description": "D", "tags": ["a", "b"]}
    assert captured_prompts and story.scenes[0].narration in captured_prompts[0]


# --------------------------------------------------------------------------
# blanket mock-mode guarantee: no paid provider entry point is ever touched
# --------------------------------------------------------------------------

def test_mock_mode_never_touches_any_paid_provider_entry_point(tmp_path, monkeypatch):
    import ai.llm.router as router_mod
    import ai.tts.elevenlabs_adapter as el_mod
    from pipeline.story import generate_story

    fal_image = Mock()
    fal_motion = Mock()
    el_cls = Mock()
    route_fn = Mock()

    monkeypatch.setattr(executors.fal_adapter, "generate_image", fal_image)
    monkeypatch.setattr(executors.fal_adapter, "generate_motion", fal_motion)
    monkeypatch.setattr(el_mod, "ElevenLabsAdapter", el_cls)
    monkeypatch.setattr(router_mod, "route", route_fn)
    monkeypatch.setattr(executors.subprocess, "run", lambda cmd, **kw: None)

    story = generate_story("proj-1", mock=True)
    scene = story.scenes[0]

    executors.execute_keyframe(scene, tmp_path / "kf.png", live=False)
    executors.execute_motion(scene, tmp_path / "kf.png", tmp_path / "m.mp4", live=False)
    executors.execute_voice(scene.narration, tmp_path / "v.m4a", live=False)
    executors.execute_thumbnail(story, tmp_path / "t.png", live=False)
    executors.execute_metadata(story, live=False)

    fal_image.assert_not_called()
    fal_motion.assert_not_called()
    el_cls.assert_not_called()
    route_fn.assert_not_called()
