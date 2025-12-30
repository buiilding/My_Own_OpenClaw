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
from backend.src.services.token_service import get_token_service

logger = logging.getLogger(__name__)

# Backward compatibility aliases
APIError = LLMAPIError
RateLimitError = LLMRateLimitError


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
    """

    def __init__(self, cfg: AppConfig):
        self.config = cfg

    async def get_completion(self, model: str, messages: List[LLMMessage]) -> str:
        """Delegates getting a completion to the appropriate provider."""
        provider = get_provider(self.config, self.config.model_provider)
        response = await provider.get_completion(model, messages)
        return response["content"]

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Delegates getting a streaming completion to the appropriate provider."""
        provider = get_provider(self.config, self.config.model_provider)
        async for event in provider.get_completion_stream(model, messages):
            yield event


def get_llm_client(cfg: AppConfig) -> LLMClient:
    """
    Factory function to get an instance of the LiteLLM client.
    Caching is removed for simplicity, as object creation is cheap.
    """
    return LiteLLMClient(cfg)
