from pathlib import Path


class KokoroAdapter:
    provider = "kokoro"

    def synthesize(self, text: str, out_path: Path, video_id: str | None = None) -> Path:
        raise NotImplementedError(
            "Kokoro self-host TTS lands in Phase 1.5 — use ElevenLabs"
        )
