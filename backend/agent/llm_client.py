"""
Abstraction layer for communicating with LLM providers using LiteLLM.

This module provides a unified interface for interacting with over 100
different Large Language Models (LLMs) through the LiteLLM library.
"""

import logging
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, List

import litellm
from litellm import exceptions as litellm_exceptions

from backend import config
from backend.config import AppConfig

logger = logging.getLogger(__name__)

# --- Custom Exceptions for Consistent Error Handling ---


class LLMError(Exception):
    """Base exception for all LLM client errors."""


class APIError(LLMError):
    """Raised for general API errors."""


class RateLimitError(LLMError):
    """Raised when an API rate limit is exceeded."""


# --- Abstract Base Class for LLM Clients ---


class LLMClient(ABC):
    """
    An abstract base class for LLM clients, defining a common interface.
    """

    @abstractmethod
    async def get_completion(self, model: str, messages: List[Dict[str, str]]) -> str:
        """
        Gets a completion from the LLM based on a list of messages.
        """

    @abstractmethod
    async def get_completion_stream(
        self, model: str, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict, None]:
        """
        Gets a streaming completion from the LLM.
        """
        yield


# --- LiteLLM Client Implementation ---


class LiteLLMClient(LLMClient):
    """
    LLM client using LiteLLM to support multiple providers.
    """

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        """Initializes the LiteLLM client."""
        self.api_key = api_key
        self.base_url = base_url
        litellm.set_verbose = False  # Suppress verbose LiteLLM logging

    async def get_completion(self, model: str, messages: List[Dict[str, str]]) -> str:
        """Gets a completion from the LLM."""
        try:
            response = await litellm.acompletion(
                model=model,
                messages=messages,
                api_key=self.api_key,
                base_url=self.base_url,
            )
            content = response.choices[0].message.content or ""
            # Log usage if available
            if hasattr(response, "usage"):
                logger.info("Token usage: %s", response.usage)
            return content
        except litellm_exceptions.RateLimitError as e:
            raise RateLimitError(f"LLM rate limit exceeded: {e}") from e
        except litellm_exceptions.APIError as e:
            raise APIError(f"LLM API error: {e}") from e
        except Exception as e:
            raise LLMError(f"An unexpected LLM error occurred: {e}") from e

    async def get_completion_stream(
        self, model: str, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict, None]:
        """Gets a streaming completion from the LLM."""
        try:
            stream = await litellm.acompletion(
                model=model,
                messages=messages,
                stream=True,
                api_key=self.api_key,
                base_url=self.base_url,
            )
            async for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield {"type": "chunk", "content": content}
        except litellm_exceptions.RateLimitError as e:
            raise RateLimitError(f"LLM rate limit exceeded: {e}") from e
        except litellm_exceptions.APIError as e:
            raise APIError(f"LLM API error: {e}") from e
        except Exception as e:
            raise LLMError(f"An unexpected LLM error occurred: {e}") from e


# --- Factory Function to Get the Client ---


def get_llm_client(cfg: AppConfig = None) -> LLMClient:
    """
    Factory function to get an instance of the LiteLLM client.

    Args:
        cfg: The application's configuration object. If None, the global
             settings object is used.

    Returns:
        An instance of the LiteLLMClient.
    """
    if cfg is None:
        cfg = config.settings

    # Determine base_url based on model mode
    base_url = None
    api_key = cfg.api_key

    if cfg.model_mode == "local":
        # For local models, determine base_url from provider
        provider = cfg.model_provider
        if provider == "ollama":
            base_url = "http://localhost:11434"
        elif provider == "lmstudio":
            base_url = "http://localhost:1234/v1"
        # If provider is not set, try to infer from legacy config
        elif hasattr(cfg.llm_providers, "ollama"):
            base_url = cfg.llm_providers.ollama.base_url
    else:
        # For online models, check if provider has a base_url (like OpenRouter)
        if cfg.model_provider:
            try:
                provider_config = cfg.llm_providers.get_provider_config(
                    cfg.model_provider
                )
                base_url = getattr(provider_config, "base_url", None)
            except ValueError:
                # Provider not found in legacy config, use default
                pass

    return LiteLLMClient(api_key=api_key, base_url=base_url)


# The example usage main() function has been removed to resolve a pylint C0415 error
# and because it is not part of the main application logic.
