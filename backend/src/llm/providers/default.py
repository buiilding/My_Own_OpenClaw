from typing import Dict, List, Optional

from backend.src.core.types import LLMMessage
from backend.src.llm.providers.gemini import GeminiProvider


class DefaultProvider(GeminiProvider):
    """
    Fallback provider for unknown or unset providers.
    Inherits from GeminiProvider as a safe, feature-rich default.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)

    def _get_full_model_string(self, model_id: str) -> str:
        # Default behavior: assume it's a Gemini model if unspecified
        if "/" not in model_id:
            return f"gemini/{model_id}"
        return model_id
