from dataclasses import dataclass


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    tokens_used: int
    cost_usd: float
