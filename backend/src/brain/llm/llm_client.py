"""
Abstraction layer for communicating with LLM providers using LiteLLM.

This module provides a unified interface for interacting with over 100
different Large Language Models (LLMs) through the LiteLLM library.
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Union

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.brain.llm.model_registry import THINKING_MODELS
from backend.src.core.config import AppConfig

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
    async def get_completion(
        self, model: str, messages: List[Union[Dict[str, str], Dict[str, Any]]]
    ) -> str:
        """
        Gets a completion from the LLM based on a list of messages.
        Messages can contain text and images.
        """

    @abstractmethod
    async def get_completion_stream(
        self, model: str, messages: List[Union[Dict[str, str], Dict[str, Any]]]
    ) -> AsyncGenerator[Dict, None]:
        """
        Gets a streaming completion from the LLM.
        Messages can contain text and images.
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
        timeout: int = 300,
    ):
        """Initializes the LiteLLM client."""
        self.api_key = api_key
        self.base_url = base_url
        self.provider = provider
        self.timeout = timeout

    def _is_thinking_model(self, model: str) -> bool:
        """Check if the model supports thinking tokens by looking it up in THINKING_MODELS."""
        # Extract provider and model ID from full model string (e.g., "anthropic/claude-sonnet-4-thinking")
        if "/" in model:
            provider, model_id = model.split("/", 1)
        else:
            # Fallback: assume current provider
            provider = self.provider or "unknown"
            model_id = model

        # Check if this provider+model combination is in THINKING_MODELS
        return provider in THINKING_MODELS and model_id in THINKING_MODELS[provider]

    async def get_completion(
        self, model: str, messages: List[Union[Dict[str, str], Dict[str, Any]]]
    ) -> str:
        """Gets a completion from the LLM."""
        try:
            params = {
                "model": model,
                "messages": messages,
                "base_url": self.base_url,
                "timeout": self.timeout,
            }
            # Enable thinking tokens for models that support it
            if self._is_thinking_model(model):
                params["thinking"] = {"type": "enabled", "budget_tokens": 16384}
                logger.info("Enabled thinking tokens for thinking model: %s", model)
            # For local models, use placeholder API key if none is provided
            if self.provider in ["lmstudio", "ollama"]:
                params["custom_llm_provider"] = "openai"
                params["api_key"] = (
                    self.api_key if self.api_key is not None else "placeholder"
                )
                logger.info("Using custom_llm_provider: openai")
            elif self.api_key is not None:
                params["api_key"] = self.api_key

            logger.info(f"Calling litellm.acompletion with {len(messages)} messages")
            # Log message structure for debugging multimodal messages
            for i, msg in enumerate(messages):
                content = msg.get("content", "")
                if isinstance(content, list):
                    logger.debug(
                        f"Message {i} ({msg.get('role')}): multimodal with {len(content)} items"
                    )
                    for j, item in enumerate(content):
                        item_type = item.get("type", "unknown")
                        logger.debug(f"  Item {j}: type={item_type}")
                        if item_type == "image_url":
                            img_url = item.get("image_url", {}).get("url", "")
                            logger.debug(f"    Image URL prefix: {img_url[:60]}...")
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
        self, model: str, messages: List[Union[Dict[str, str], Dict[str, Any]]]
    ) -> AsyncGenerator[Dict, None]:
        """Gets a streaming completion from the LLM."""
        try:
            params = {
                "model": model,
                "messages": messages,
                "stream": True,
                "base_url": self.base_url,
                "timeout": self.timeout,
            }
            # Enable thinking tokens for models that support it
            is_thinking_model = self._is_thinking_model(model)
            if is_thinking_model:
                params["thinking"] = {"type": "enabled", "budget_tokens": 16384}
                logger.info("Enabled thinking tokens for thinking model: %s", model)
            # For local models, use placeholder API key if none is provided
            if self.provider in ["lmstudio", "ollama"]:
                params["custom_llm_provider"] = "openai"
                params["api_key"] = (
                    self.api_key if self.api_key is not None else "placeholder"
                )
            elif self.api_key is not None:
                params["api_key"] = self.api_key

            # Log message structure for debugging multimodal messages
            for i, msg in enumerate(messages):
                content = msg.get("content", "")
                if isinstance(content, list):
                    logger.debug(
                        f"Stream message {i} ({msg.get('role')}): multimodal with {len(content)} items"
                    )
                    for j, item in enumerate(content):
                        item_type = item.get("type", "unknown")
                        logger.debug(f"  Item {j}: type={item_type}")
                        if item_type == "image_url":
                            img_url = item.get("image_url", {}).get("url", "")
                            logger.debug(f"    Image URL prefix: {img_url[:60]}...")

            stream = await litellm.acompletion(**params)
            async for chunk in stream:
                if not chunk or not hasattr(chunk, "choices") or not chunk.choices:
                    continue  # Skip chunks with no choices
                if not chunk.choices[0]:
                    continue
                if not hasattr(chunk.choices[0], "delta") or not chunk.choices[0].delta:
                    continue

                delta = chunk.choices[0].delta

                # Check for thinking/reasoning tokens (for both thinking models and local models with reasoning capabilities)
                # Some local models (like Qwen) expose reasoning tokens even if not in THINKING_MODELS
                thinking_content = None

                # Primary method: Check delta.reasoning_content (LiteLLM's standard field)
                if hasattr(delta, "reasoning_content") and delta.reasoning_content:
                    thinking_content = delta.reasoning_content
                # Fallback: Check other possible field names
                elif hasattr(delta, "thinking") and delta.thinking:
                    thinking_content = delta.thinking
                elif hasattr(delta, "reasoning") and delta.reasoning:
                    thinking_content = delta.reasoning
                elif hasattr(delta, "thought") and delta.thought:
                    thinking_content = delta.thought

                if thinking_content:
                    # Handle both string and dict formats
                    if isinstance(thinking_content, str):
                        yield {"type": "thinking_chunk", "content": thinking_content}
                    elif isinstance(thinking_content, dict):
                        # Extract text from dict if present
                        text = thinking_content.get("text") or thinking_content.get("content")
                        if text:
                            yield {"type": "thinking_chunk", "content": text}

                # Extract regular content tokens
                content = getattr(delta, "content", None)
                if content:
                    yield {"type": "chunk", "content": content}
        except litellm_exceptions.RateLimitError as e:
            logger.error(f"Rate limit exceeded for model {model}: {e}")
            raise RateLimitError(f"LLM rate limit exceeded: {e}. Please wait a moment and try again.") from e
        except litellm_exceptions.APIError as e:
            logger.error(f"API error for model {model}: {e}")
            raise APIError(f"LLM API error: {e}") from e
        except Exception as e:
            logger.error(f"Unexpected error for model {model}: {e}")
            raise LLMError(f"An unexpected LLM error occurred: {e}") from e


# --- Factory Function to Get the Client ---


def get_llm_client(cfg: AppConfig) -> LLMClient:
    """
    Factory function to get an instance of the LiteLLM client.

    Args:
        cfg: The application's configuration object.

    Returns:
        An instance of the LiteLLMClient.
    """
    if cfg is None:
        raise ValueError("AppConfig cannot be None")

    # Enable LiteLLM debug logging if configured
    if cfg.debug_litellm:
        litellm._turn_on_debug()
        logger.info("LiteLLM debug logging enabled")

    # Determine base_url based on model mode
    base_url = None
    api_key = cfg.api_key
    provider = cfg.model_provider
    timeout = cfg.llm_timeout

    if cfg.model_mode == "local":
        # For local models, get the base_url from the provider's config
        if not provider:
            logger.error(
                "Local model mode selected but model_provider is empty. "
                "Please select a model provider in settings."
            )
        else:
            try:
                provider_config = cfg.llm_providers.get_provider_config(provider)
                base_url = getattr(provider_config, "base_url", None)
                if base_url:
                    logger.info(
                        "Using local provider '%s' with base_url: %s",
                        provider,
                        base_url,
                    )
                else:
                    logger.warning(
                        "Provider '%s' config found but base_url is not set.", provider
                    )
            except ValueError as e:
                logger.error(
                    "Could not find config for local provider '%s': %s. "
                    "Available providers: %s",
                    provider,
                    e,
                    [
                        attr
                        for attr in dir(cfg.llm_providers)
                        if not attr.startswith("_")
                    ],
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

    return LiteLLMClient(
        api_key=api_key, base_url=base_url, provider=provider, timeout=timeout
    )
