"""
Abstraction layer for communicating with LLM providers using LiteLLM.

This module provides a unified interface for interacting with over 100
different Large Language Models (LLMs) through the LiteLLM library.
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.config import AppConfig
from backend.src.core.events import StreamingEvent
from backend.src.core.exceptions import LLMAPIError, LLMRateLimitError
from backend.src.core.types import LLMMessage
from backend.src.llm.providers import get_provider
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


# --- Abstract Base Class for LLM Clients ---


class LLMClient(ABC):
    """
    An abstract base class for LLM clients, defining a common interface.
    """

    @abstractmethod
    async def get_completion(self, model: str, messages: List[LLMMessage]) -> str:
        """
        Gets a completion from the LLM based on a list of messages.
        """

    @abstractmethod
    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Gets a streaming completion from the LLM, yielding StreamingEvent objects.
        """
        yield


class LiteLLMClient(LLMClient):
    """
    A simple orchestrator that delegates all real work to the provider layer.
    This client is now truly abstract and provider-agnostic.
    
    Caches provider instances to avoid recreating them on every request.
    """

    def __init__(self, cfg: AppConfig):
        self.config = cfg
        self._provider: Optional[LLMProvider] = None
        self._provider_name: Optional[str] = None

    def _get_provider(self) -> LLMProvider:
        """
        Get the provider instance, caching it if the provider name hasn't changed.
        
        Returns:
            The appropriate LLM provider instance
        """
        current_provider_name = self.config.model_provider or "default"
        
        # Recreate provider if provider name changed or not yet cached
        if self._provider is None or self._provider_name != current_provider_name:
            self._provider = get_provider(self.config, current_provider_name)
            self._provider_name = current_provider_name
            logger.debug(f"Cached provider: {current_provider_name}")
        
        return self._provider

    async def get_completion(self, model: str, messages: List[LLMMessage]) -> str:
        """
        Delegates getting a completion to the appropriate provider.
        
        Extracts content from normalized response with validation.
        
        Raises:
            LLMAPIError: If response structure is invalid
        """
        provider = self._get_provider()
        response = await provider.get_completion(model, messages)
        
        # Validate response structure (TypedDict guarantees type hints but not runtime structure)
        if not isinstance(response, dict):
            raise LLMAPIError(
                f"Invalid response type from provider: expected dict, got {type(response).__name__}",
                model=model
            )
        
        if "content" not in response:
            raise LLMAPIError(
                f"Invalid response structure from provider: missing 'content' key. Keys: {list(response.keys())}",
                model=model
            )
        
        content = response["content"]
        if not isinstance(content, str):
            raise LLMAPIError(
                f"Invalid content type from provider: expected str, got {type(content).__name__}",
                model=model
            )
        
        return content

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Delegates getting a streaming completion to the appropriate provider."""
        provider = self._get_provider()
        async for event in provider.get_completion_stream(model, messages):
            yield event


def get_llm_client(cfg: AppConfig) -> LLMClient:
    """
    Factory function to get an instance of the LiteLLM client.
    Caching is removed for simplicity, as object creation is cheap.
    """
    return LiteLLMClient(cfg)
