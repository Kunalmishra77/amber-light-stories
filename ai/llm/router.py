from app.config import get_settings
from ai.llm.gemini_adapter import GeminiAdapter
from ai.llm.openai_adapter import OpenAIAdapter

_OPENAI_TASKS = {"script", "title", "description", "reasoning"}
_GEMINI_TASKS = {"seo", "tags", "research", "translation", "analytics"}


def route(task_type: str):
    """Return (adapter, model) for a pipeline task type."""
    s = get_settings()
    if task_type == "script":
        return OpenAIAdapter(), s.openai_script_model
    if task_type in ("title", "description"):
        return OpenAIAdapter(), s.openai_cheap_model
    if task_type == "reasoning":
        return OpenAIAdapter(), s.openai_reasoning_model
    if task_type in _GEMINI_TASKS:
        return GeminiAdapter(), s.gemini_flash_model
    raise ValueError(f"Unknown LLM task type: {task_type}")
