"""Per-character narration voices.

The rule that matters: the existing single-call path must keep running
untouched unless a story genuinely has more than one speaking voice. Most
workspaces never assign character voices, and their audio pipeline works —
this feature must not put that at risk.
"""
from pathlib import Path

import ai.tts.elevenlabs_adapter as el
import pipeline.executors as ex
import pipeline.orchestrator as orch


class _FakeAdapter:
    """Records what was asked of ElevenLabs instead of calling it."""

    calls: list = []

    def synthesize(self, text, out_path, video_id=None, voice_id=None):
        _FakeAdapter.calls.append((text, voice_id))
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_bytes(b"audio")
        return out_path


def _forbid_multivoice(monkeypatch):
    def _boom(*_a, **_k):
        raise AssertionError("multi-voice path must not run for a single voice")

    monkeypatch.setattr(ex, "_synthesize_multivoice", _boom)


def test_one_distinct_voice_uses_the_original_single_call(monkeypatch, tmp_path):
    _FakeAdapter.calls = []
    monkeypatch.setattr(el, "ElevenLabsAdapter", _FakeAdapter)
    monkeypatch.setattr(ex, "_probe_duration", lambda _p: 3.0)
    _forbid_multivoice(monkeypatch)

    out = tmp_path / "voice.m4a"
    ex.execute_voice(
        "the whole narration", out, live=True,
        segments=[("a", "VOICE_1"), ("b", "VOICE_1"), ("c", None)],
    )

    # One call, whole text, no voice override — exactly the old behaviour.
    assert _FakeAdapter.calls == [("the whole narration", None)]


def test_no_segments_at_all_uses_the_original_single_call(monkeypatch, tmp_path):
    _FakeAdapter.calls = []
    monkeypatch.setattr(el, "ElevenLabsAdapter", _FakeAdapter)
    monkeypatch.setattr(ex, "_probe_duration", lambda _p: 2.0)
    _forbid_multivoice(monkeypatch)

    ex.execute_voice("just narration", tmp_path / "voice.m4a", live=True)
    assert _FakeAdapter.calls == [("just narration", None)]


def test_two_distinct_voices_route_to_multivoice(monkeypatch, tmp_path):
    seen = {}

    def _fake_multi(segments, out_path):
        seen["segments"] = segments
        return out_path, 4.2

    monkeypatch.setattr(ex, "_synthesize_multivoice", _fake_multi)

    class _Boom:
        def synthesize(self, *_a, **_k):
            raise AssertionError("single-call path must not run for two voices")

    monkeypatch.setattr(el, "ElevenLabsAdapter", _Boom)

    out = tmp_path / "voice.m4a"
    _path, duration = ex.execute_voice(
        "all of it", out, live=True, segments=[("a", "VOICE_1"), ("b", "VOICE_2")]
    )

    assert duration == 4.2
    assert seen["segments"] == [("a", "VOICE_1"), ("b", "VOICE_2")]


def test_mock_mode_ignores_segments_entirely(monkeypatch, tmp_path):
    # $0 mode must never reach ElevenLabs, however many voices are listed.
    _forbid_multivoice(monkeypatch)

    class _Boom:
        def synthesize(self, *_a, **_k):
            raise AssertionError("mock mode must not synthesize")

    monkeypatch.setattr(el, "ElevenLabsAdapter", _Boom)

    out = tmp_path / "voice.m4a"
    path, duration = ex.execute_voice(
        "hello world", out, live=False, segments=[("a", "V1"), ("b", "V2")]
    )
    assert Path(path).exists()
    assert duration > 0


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def execute(self):
        return _Result(self._rows)


class _Sb:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _Table(self._rows)


def test_character_refs_carry_the_voice_id():
    sb = _Sb([{"id": "c1", "name": "Mira", "descriptor": {"hair": "silver"},
               "seed": 7, "voice_id": "VOICE_MIRA"}])
    refs = orch._load_character_refs(sb, [{"character_id": "c1"}])
    assert refs["c1"]["voice_id"] == "VOICE_MIRA"


def test_character_with_a_voice_but_no_description_still_counts():
    # They can speak even if their look falls back to the scene prompt.
    sb = _Sb([{"id": "c1", "name": None, "descriptor": {}, "seed": None,
               "voice_id": "VOICE_ONLY"}])
    refs = orch._load_character_refs(sb, [{"character_id": "c1"}])
    assert refs["c1"]["voice_id"] == "VOICE_ONLY"
    assert refs["c1"]["reference"] is None


def test_scene_carries_its_characters_voice():
    refs = {"c1": {"reference": "Mira", "seed": 7, "voice_id": "VOICE_MIRA"}}
    scene = orch._scene_from_row({"id": "s1", "seq": 0, "character_id": "c1"}, refs)
    assert scene.character_voice_id == "VOICE_MIRA"


def test_scene_without_a_character_has_no_voice():
    scene = orch._scene_from_row({"id": "s1", "seq": 0}, {})
    assert scene.character_voice_id is None
