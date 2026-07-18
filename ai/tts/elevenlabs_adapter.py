from pathlib import Path

from app.config import get_settings
from app.usage import log_usage

# ElevenLabs Pro plan works out to roughly $0.11 per 1K characters.
COST_PER_CHAR = 0.00011


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

    def synthesize(self, text: str, out_path: Path, video_id: str | None = None) -> Path:
        s = get_settings()
        audio = self.client.text_to_speech.convert(
            voice_id=s.elevenlabs_voice_id,
            text=text,
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"".join(audio))
        log_usage(self.provider, "tts", len(text), len(text) * COST_PER_CHAR, video_id)
        return out_path
