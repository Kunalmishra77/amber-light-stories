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


def test_chunk_text_short_returns_single_chunk():
    from ai.tts.elevenlabs_adapter import chunk_text
    assert chunk_text("A short story.") == ["A short story."]
    assert chunk_text("") == []


def test_chunk_text_splits_over_limit_on_paragraphs():
    from ai.tts.elevenlabs_adapter import chunk_text
    para = "word " * 400  # ~2000 chars per paragraph
    text = "\n\n".join([para.strip()] * 5)  # ~10k chars total
    chunks = chunk_text(text, limit=3000)
    assert len(chunks) > 1
    assert all(len(c) <= 3000 for c in chunks)
    # no words are lost across the split
    assert sum(len(c.split()) for c in chunks) == len(text.split())


def test_chunk_text_hard_splits_a_giant_paragraph():
    from ai.tts.elevenlabs_adapter import chunk_text
    giant = "x" * 25000  # single paragraph, no sentence breaks
    chunks = chunk_text(giant, limit=9000)
    assert all(len(c) <= 9000 for c in chunks)
    assert "".join(chunks) == giant


def test_synthesize_concatenates_multiple_chunks(tmp_path, monkeypatch):
    import ai.tts.elevenlabs_adapter as mod
    from ai.tts.elevenlabs_adapter import ElevenLabsAdapter

    monkeypatch.setattr(mod, "log_usage", lambda *a, **k: None)
    adapter = ElevenLabsAdapter()
    fake_client = MagicMock()
    # one audio blob per convert() call; two chunks -> two calls -> concatenated
    fake_client.text_to_speech.convert.side_effect = [
        [b"AAA"], [b"BBB"],
    ]
    adapter._client = fake_client

    long_text = ("para " * 1000).strip() + "\n\n" + ("more " * 1000).strip()  # ~10k chars, 2 paras
    out = adapter.synthesize(long_text, tmp_path / "voice.mp3", video_id="v1")
    assert fake_client.text_to_speech.convert.call_count == 2
    assert out.read_bytes() == b"AAABBB"


def test_kokoro_is_explicit_stub(tmp_path):
    from ai.tts.kokoro_adapter import KokoroAdapter
    with pytest.raises(NotImplementedError):
        KokoroAdapter().synthesize("hi", tmp_path / "x.mp3")
