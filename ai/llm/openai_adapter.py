from app.config import get_settings
from ai.llm.base import LLMResult

# Approximate blended $/1K tokens; refine against real invoices later.
PRICING_PER_1K = {"gpt-5.4": 0.005, "gpt-5.4-mini": 0.0006, "o4-mini": 0.004}


class OpenAIAdapter:
    provider = "openai"

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(api_key=get_settings().openai_api_key)
        return self._client

    def generate(self, prompt: str, model: str | None = None,
                 system: str | None = None) -> LLMResult:
        model = model or get_settings().openai_script_model
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = self.client.chat.completions.create(model=model, messages=messages)
        tokens = resp.usage.total_tokens
        cost = tokens / 1000 * PRICING_PER_1K.get(model, 0.005)
        return LLMResult(resp.choices[0].message.content, self.provider, model, tokens, cost)
