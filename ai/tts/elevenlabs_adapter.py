from pathlib import Path

from app.config import get_settings
from app.usage import log_usage

# ElevenLabs Pro plan works out to roughly $0.11 per 1K characters.
COST_PER_CHAR = 0.00011
# The text-to-speech endpoint rejects a single request over 10000 chars
# ("text_too_long"). Chunk below that with a safety margin.
MAX_TTS_CHARS = 9000


def chunk_text(text: str, limit: int = MAX_TTS_CHARS) -> list[str]:
    """Split text into chunks each <= limit chars, preferring paragraph then
    sentence boundaries so narration breaks fall in natural pauses."""
    text = text.strip()
    if len(text) <= limit:
        return [text] if text else []

    def split_oversized(unit: str) -> list[str]:
        # A single paragraph longer than the limit: split on sentence ends.
        parts, buf = [], ""
        for sentence in unit.replace("! ", "!\n").replace("? ", "?\n").replace(". ", ".\n").split("\n"):
            piece = (buf + " " + sentence).strip() if buf else sentence
            if len(piece) <= limit:
                buf = piece
            else:
                if buf:
                    parts.append(buf)
                # Sentence itself still too long: hard-slice it.
                while len(sentence) > limit:
                    parts.append(sentence[:limit])
                    sentence = sentence[limit:]
                buf = sentence
        if buf:
            parts.append(buf)
        return parts

    chunks, current = [], ""
    for para in text.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        candidate = (current + "\n\n" + para) if current else para
        if len(candidate) <= limit:
            current = candidate
        else:
            if current:
                chunks.append(current)
                current = ""
            if len(para) <= limit:
                current = para
            else:
                chunks.extend(split_oversized(para))
    if current:
        chunks.append(current)
    return chunks


class ElevenLabsAdapter:
    provider = "elevenlabs"

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from elevenlabs.client import ElevenLabs
            self._client = ElevenLabs(api_key=get_settings().elevenlabs_api_key)
        return self._client

    def synthesize(
        self,
        text: str,
        out_path: Path,
        video_id: str | None = None,
        voice_id: str | None = None,
    ) -> Path:
        """Render `text` to speech. `voice_id` overrides the workspace default,
        which is how a scene spoken by a character uses THAT character's voice;
        omitted, it falls back to the configured narrator."""
        s = get_settings()
        chunks = chunk_text(text)
        audio_bytes = b""
        for chunk in chunks:
            audio = self.client.text_to_speech.convert(
                voice_id=voice_id or s.elevenlabs_voice_id,
                text=chunk,
                model_id="eleven_multilingual_v2",
                output_format="mp3_44100_128",
            )
            audio_bytes += b"".join(audio)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(audio_bytes)
        log_usage(self.provider, "tts", len(text), len(text) * COST_PER_CHAR, video_id)
        return out_path
