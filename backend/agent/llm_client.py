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

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        provider: str | None = None,
    ):
        """Initializes the LiteLLM client."""
        self.api_key = api_key
        self.base_url = base_url
        self.provider = provider

    async def get_completion(self, model: str, messages: List[Dict[str, str]]) -> str:
        """Gets a completion from the LLM."""
        try:
            params = {
                "model": model,
                "messages": messages,
                "api_key": self.api_key,
                "base_url": self.base_url,
            }
            if self.provider in ["lmstudio", "ollama"]:
                params["custom_llm_provider"] = "openai"

            response = await litellm.acompletion(**params)
            # Validate response structure before accessing nested attributes
            if not response:
                raise APIError("LLM returned None response")
            if (
                not hasattr(response, "choices")
                or not isinstance(response.choices, list)
                or len(response.choices) == 0
            ):
                raise APIError("LLM response missing or empty choices list")
            if not response.choices[0]:
                raise APIError("LLM response choices[0] is None")
            if (
                not hasattr(response.choices[0], "message")
                or not response.choices[0].message
            ):
                raise APIError("LLM response choices[0] missing message attribute")
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
            params = {
                "model": model,
                "messages": messages,
                "stream": True,
                "api_key": self.api_key,
                "base_url": self.base_url,
            }
            if self.provider in ["lmstudio", "ollama"]:
                params["custom_llm_provider"] = "openai"
            stream = await litellm.acompletion(**params)
            async for chunk in stream:
                if not chunk or not hasattr(chunk, "choices") or not chunk.choices:
                    continue  # Skip chunks with no choices
                if not chunk.choices[0]:
                    continue
                if not hasattr(chunk.choices[0], "delta") or not chunk.choices[0].delta:
                    continue
                content = getattr(chunk.choices[0].delta, "content", None)
                if content:
                    yield {"type": "chunk", "content": content}
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
    provider = cfg.model_provider

    if cfg.model_mode == "local":
        # For local models, get the base_url from the provider's config
        try:
            provider_config = cfg.llm_providers.get_provider_config(provider)
            base_url = getattr(provider_config, "base_url", None)
        except ValueError:
            logger.warning(
                "Could not find config for local provider '%s', no base_url set.",
                provider,
            )
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

    return LiteLLMClient(api_key=api_key, base_url=base_url, provider=provider)


# The example usage main() function has been removed to resolve a pylint C0415 error
# and because it is not part of the main application logic.
