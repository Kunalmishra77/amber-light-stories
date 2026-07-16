from unittest.mock import MagicMock

import pytest


def test_elevenlabs_writes_audio_and_logs(tmp_path, monkeypatch):
    import ai.tts.elevenlabs_adapter as mod
    from ai.tts.elevenlabs_adapter import ElevenLabsAdapter

    logged = {}
    monkeypatch.setattr(
        mod, "log_usage",
        lambda provider, endpoint, units, cost_usd, video_id=None: logged.update(
            provider=provider, units=units, cost=cost_usd),
    )
    adapter = ElevenLabsAdapter()
    fake_client = MagicMock()
    fake_client.text_to_speech.convert.return_value = iter([b"ID3", b"audio-bytes"])
    adapter._client = fake_client

    out = adapter.synthesize("Hello world", tmp_path / "voice.mp3", video_id="v1")
    assert out.read_bytes() == b"ID3audio-bytes"
    assert logged["provider"] == "elevenlabs"
    assert logged["units"] == len("Hello world")


def test_kokoro_is_explicit_stub(tmp_path):
    from ai.tts.kokoro_adapter import KokoroAdapter
    with pytest.raises(NotImplementedError):
        KokoroAdapter().synthesize("hi", tmp_path / "x.mp3")
