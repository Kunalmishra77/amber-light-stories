from app.config import get_settings
from ai.llm.base import LLMResult

PRICING_PER_1K = {
    "gemini-flash-latest": 0.0003, "gemini-flash-lite-latest": 0.0001,
    "gemini-2.5-flash": 0.0003, "gemini-2.5-flash-lite": 0.0001,
}


class GeminiAdapter:
    provider = "gemini"

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=get_settings().gemini_api_key)
        return self._client

    def generate(self, prompt: str, model: str | None = None) -> LLMResult:
        model = model or get_settings().gemini_flash_model
        resp = self.client.models.generate_content(model=model, contents=prompt)
        tokens = getattr(resp.usage_metadata, "total_token_count", 0) or 0
        cost = tokens / 1000 * PRICING_PER_1K.get(model, 0.0003)
        return LLMResult(resp.text, self.provider, model, tokens, cost)
