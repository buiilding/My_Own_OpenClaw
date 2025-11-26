from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, List, Optional

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.config import AppConfig
from backend.src.core.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.types import (
    LLMMessage,
    NormalizedLLMResponse,
    StreamingChunk,
)


class LLMProvider(ABC):
    """
    Abstract base class for a true LLM provider.
    It handles request construction, calling the LLM, and normalizing the response.
    """



    def __init__(self, cfg: AppConfig):
        self.config = cfg

    @abstractmethod
    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        """Gets a completion from the LLM and returns a normalized response."""
        pass

    @abstractmethod
    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingChunk, None]:
        """Gets a streaming completion from the LLM, yielding normalized chunks."""
        yield

    def _build_request_params(self, model: str, messages: List[LLMMessage]) -> dict:
        """Helper to construct the basic request parameters for LiteLLM."""
        provider_name = self.config.model_provider
        provider_config = self.config.llm_providers.get_provider_config(provider_name)

        params = {
            "model": self._get_full_model_string(model),
            "messages": messages,
            "api_key": self.config.api_key,
            "base_url": self._get_base_url(provider_config),
            "timeout": self.config.llm_timeout,
        }
        return params

    @abstractmethod
    def _get_full_model_string(self, model_id: str) -> str:
        """Constructs the full model string required by LiteLLM."""
        pass

    @abstractmethod
    def _get_base_url(self, provider_config: Any) -> Optional[str]:
        """Extracts the base_url from the provider-specific configuration."""
        pass
