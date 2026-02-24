import logging
from typing import Optional

from backend.src.llm.providers.online import OnlineLLMProvider

logger = logging.getLogger(__name__)


class OpenRouterProvider(OnlineLLMProvider):
    """Provider for OpenRouter."""

    provider_label = "OpenRouter"
    model_prefix = "openrouter"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        # Default base_url for OpenRouter if not provided
        if base_url is None:
            base_url = "https://openrouter.ai/api/v1"
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)
