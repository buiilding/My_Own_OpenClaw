"""
Abstraction layer for communicating with multiple LLM providers.

This module provides a unified interface for interacting with different
Large Language Models (LLMs) like OpenAI, Anthropic, and Google. It uses a
factory pattern to instantiate the correct client based on the application's
configuration.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from functools import wraps
from typing import AsyncGenerator, Dict, List

import anthropic
import openai
from google import genai
from google.api_core import exceptions

from backend import config
from backend.config import AppConfig

logger = logging.getLogger(__name__)

# Conditionally import ThinkingConfig to handle different library versions
try:
    from google.genai.types import ThinkingConfig

    HAS_THINKING_CONFIG = True
except ImportError:
    HAS_THINKING_CONFIG = False

# --- Custom Exceptions for Consistent Error Handling ---


class LLMError(Exception):
    """Base exception for all LLM client errors."""


class APIError(LLMError):
    """Raised for general API errors."""


class RateLimitError(LLMError):
    """Raised when an API rate limit is exceeded."""


# --- Decorator for Retry Logic ---


def retry_on_rate_limit(max_retries=3, initial_backoff=1.0):
    """A decorator to retry an async function on RateLimitError."""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            delay = initial_backoff
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except RateLimitError:
                    if attempt == max_retries - 1:
                        raise
                    logger.warning(
                        "Rate limit exceeded. Retrying in %.2f seconds... (Attempt %d/%d)",
                        delay,
                        attempt + 1,
                        max_retries,
                    )
                    await asyncio.sleep(delay)
                    delay *= 2  # Exponential backoff

        return wrapper

    return decorator


# --- Abstract Base Class for LLM Clients ---


class LLMClient(ABC):
    """
    An abstract base class for LLM clients, defining a common interface.
    """

    @abstractmethod
    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        """
        Gets a completion from the LLM based on a list of messages.

        Args:
            messages: A list of message dictionaries, e.g.,
                      [{"role": "user", "content": "Hello"}].

        Returns:
            The assistant's response as a string.

        Raises:
            APIError: If the API call fails.
            RateLimitError: If the API rate limit is exceeded.
        """

    @abstractmethod
    async def get_completion_stream(
        self, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict, None]:
        """
        Gets a streaming completion from the LLM.

        Args:
            messages: A list of message dictionaries.

        Yields:
            Event dictionaries, e.g., {"type": "chunk", "content": "text"}
        """
        yield  # This makes it a generator


# --- Concrete Implementations for Each Provider ---


class OpenAIClient(LLMClient):
    """LLM client for OpenAI models."""

    def __init__(self, api_key: str, model: str):
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.model = model

    @retry_on_rate_limit()
    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
            )
            if response.usage:
                logger.info(
                    "OpenAI token usage: prompt=%d, completion=%d, total=%d",
                    response.usage.prompt_tokens,
                    response.usage.completion_tokens,
                    response.usage.total_tokens,
                )
            return response.choices[0].message.content or ""
        except openai.RateLimitError as e:
            raise RateLimitError(f"OpenAI rate limit exceeded: {e}") from e
        except openai.APIError as e:
            raise APIError(f"OpenAI API error: {e}") from e

    async def get_completion_stream(
        self, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict, None]:
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices:
                    content = chunk.choices[0].delta.content
                    if content:
                        yield {"type": "chunk", "content": content}
        except openai.RateLimitError as e:
            raise RateLimitError(f"OpenAI rate limit exceeded: {e}") from e
        except openai.APIError as e:
            raise APIError(f"OpenAI API error: {e}") from e


class AnthropicClient(LLMClient):
    """LLM client for Anthropic (Claude) models."""

    def __init__(self, api_key: str, model: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    @retry_on_rate_limit()
    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            # Anthropic requires the system prompt to be a top-level parameter
            system_prompt = ""
            if messages and messages[0]["role"] == "system":
                system_prompt = messages[0]["content"]
                messages = messages[1:]

            response = await self.client.messages.create(
                model=self.model,
                max_tokens=4096,  # Recommended default
                system=system_prompt,
                messages=messages,
            )
            if response.usage:
                logger.info(
                    "Anthropic token usage: prompt=%d, completion=%d, total=%d",
                    response.usage.input_tokens,
                    response.usage.output_tokens,
                    response.usage.input_tokens + response.usage.output_tokens,
                )
            return response.content[0].text
        except anthropic.RateLimitError as e:
            raise RateLimitError(f"Anthropic rate limit exceeded: {e}") from e
        except anthropic.APIError as e:
            raise APIError(f"Anthropic API error: {e}") from e

    async def get_completion_stream(
        self, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict, None]:
        try:
            system_prompt = ""
            if messages and messages[0]["role"] == "system":
                system_prompt = messages[0]["content"]
                messages = messages[1:]

            async with self.client.messages.stream(
                model=self.model,
                max_tokens=4096,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield {"type": "chunk", "content": text}
        except anthropic.RateLimitError as e:
            raise RateLimitError(f"Anthropic rate limit exceeded: {e}") from e
        except anthropic.APIError as e:
            raise APIError(f"Anthropic API error: {e}") from e


class GoogleClient(LLMClient):
    """LLM client for Google (Gemini) models."""

    def __init__(self, api_key: str, model: str):
        self.client = genai.Client(api_key=api_key)
        self.model_name = model

    @retry_on_rate_limit()
    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            contents = [
                genai.types.Content(
                    role="user" if m["role"] == "user" else "model",
                    parts=[genai.types.Part(text=m["content"])],
                )
                for m in messages
            ]
            response = await self.client.aio.models.generate_content(
                model=self.model_name, contents=contents
            )
            return response.text
        except genai.types.StopCandidateException as e:
            # This can happen if the model stops generating for safety reasons.
            # We'll treat it as a normal completion for now.
            logger.warning("Google response stopped early: %s", e)
            return "".join(
                part.text
                for part in e.candidates[0].content.parts
                if hasattr(part, "text")
            )
        except exceptions.ResourceExhausted as e:
            raise RateLimitError(f"Google rate limit exceeded: {e}") from e
        except exceptions.GoogleAPICallError as e:
            raise APIError(f"Google API error: {e}") from e

    async def get_completion_stream(
        self, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict, None]:
        try:
            contents = [
                genai.types.Content(
                    role="user" if m["role"] == "user" else "model",
                    parts=[genai.types.Part(text=m["content"])],
                )
                for m in messages
            ]

            config = None
            if HAS_THINKING_CONFIG:
                config = genai.types.GenerateContentConfig(
                    thinking_config=genai.types.ThinkingConfig(
                        include_thoughts=True,
                    )
                )
            else:
                logger.warning(
                    "The installed 'google-genai' library version does not support 'ThinkingConfig'. "
                    "Thinking display will not be available for Google models. Please upgrade the library."
                )

            stream = await self.client.aio.models.generate_content_stream(
                model=self.model_name,
                contents=contents,
                config=config,
            )

            async for chunk in stream:
                for candidate in chunk.candidates:
                    for part in candidate.content.parts:
                        if hasattr(part, "thought") and part.thought:
                            yield {"type": "thinking", "content": part.text}
                        elif hasattr(part, "text") and part.text:
                            yield {"type": "chunk", "content": part.text}

        except exceptions.ResourceExhausted as e:
            raise RateLimitError(f"Google rate limit exceeded: {e}") from e
        except exceptions.GoogleAPICallError as e:
            raise APIError(f"Google API error: {e}") from e


class OllamaClient(LLMClient):
    """LLM client for local Ollama models."""

    def __init__(self, base_url: str, model: str):
        # Ollama uses the OpenAI SDK, but with a custom base_url and no API key
        self.client = openai.AsyncOpenAI(base_url=base_url, api_key="ollama")
        self.model = model

    @retry_on_rate_limit()
    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
            )
            if response.usage:
                logger.info(
                    "Ollama token usage: prompt=%d, completion=%d, total=%d",
                    response.usage.prompt_tokens,
                    response.usage.completion_tokens,
                    response.usage.total_tokens,
                )
            return response.choices[0].message.content or ""
        except openai.APIError as e:
            raise APIError(f"Ollama API error: {e}") from e

    @retry_on_rate_limit()
    async def get_completion_stream(
        self, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict, None]:
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices:
                    content = chunk.choices[0].delta.content
                    if content:
                        yield {"type": "chunk", "content": content}
        except openai.APIError as e:
            raise APIError(f"Ollama API error: {e}") from e


class OpenRouterClient(LLMClient):
    """LLM client for the OpenRouter API."""

    def __init__(self, api_key: str, model: str):
        self.client = openai.AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            default_headers={
                "HTTP-Referer": "http://localhost:3000",  # Can be a placeholder
                "X-Title": "Desktop Assistant",
            },
        )
        self.model = model

    @retry_on_rate_limit()
    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
            )
            if response.usage:
                logger.info(
                    "OpenRouter token usage: prompt=%d, completion=%d, total=%d",
                    response.usage.prompt_tokens,
                    response.usage.completion_tokens,
                    response.usage.total_tokens,
                )
            return response.choices[0].message.content or ""
        except openai.RateLimitError as e:
            raise RateLimitError(f"OpenRouter rate limit exceeded: {e}") from e
        except openai.APIError as e:
            raise APIError(f"OpenRouter API error: {e}") from e

    async def get_completion_stream(
        self, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict, None]:
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices:
                    content = chunk.choices[0].delta.content
                    if content:
                        yield {"type": "chunk", "content": content}
        except openai.RateLimitError as e:
            raise RateLimitError(f"OpenRouter rate limit exceeded: {e}") from e
        except openai.APIError as e:
            raise APIError(f"OpenRouter API error: {e}") from e


class MistralClient(LLMClient):
    """LLM client for the Mistral AI API."""

    def __init__(self, api_key: str, model: str):
        self.client = openai.AsyncOpenAI(
            base_url="https://api.mistral.ai/v1/",
            api_key=api_key,
        )
        self.model = model

    @retry_on_rate_limit()
    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
            )
            if response.usage:
                logger.info(
                    "Mistral token usage: prompt=%d, completion=%d, total=%d",
                    response.usage.prompt_tokens,
                    response.usage.completion_tokens,
                    response.usage.total_tokens,
                )
            return response.choices[0].message.content or ""
        except openai.RateLimitError as e:
            raise RateLimitError(f"Mistral AI rate limit exceeded: {e}") from e
        except openai.APIError as e:
            raise APIError(f"Mistral AI API error: {e}") from e

    async def get_completion_stream(
        self, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict, None]:
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices:
                    content = chunk.choices[0].delta.content
                    if content:
                        yield {"type": "chunk", "content": content}
        except openai.RateLimitError as e:
            raise RateLimitError(f"Mistral AI rate limit exceeded: {e}") from e
        except openai.APIError as e:
            raise APIError(f"Mistral AI API error: {e}") from e


# --- Factory Function to Get the Correct Client ---


def get_llm_client(cfg: AppConfig = None) -> LLMClient:
    """
    Factory function to get an instance of the correct LLM client based on config.

    Args:
        cfg: The application's configuration object. If None, the global
             settings object is used.

    Returns:
        An instance of a class that implements the LLMClient interface.

    Raises:
        ValueError: If the configured provider is not supported.
    """
    if cfg is None:
        cfg = config.settings

    provider = cfg.active_provider
    api_key = cfg.api_key

    if provider == "openai":
        return OpenAIClient(api_key=api_key, model=cfg.llm_providers.openai.model)
    if provider == "anthropic":
        return AnthropicClient(api_key=api_key, model=cfg.llm_providers.anthropic.model)
    if provider == "google":
        return GoogleClient(api_key=api_key, model=cfg.llm_providers.google.model)
    if provider == "ollama":
        return OllamaClient(
            base_url=cfg.llm_providers.ollama.base_url,
            model=cfg.llm_providers.ollama.model,
        )
    if provider == "openrouter":
        return OpenRouterClient(
            api_key=api_key, model=cfg.llm_providers.openrouter.model
        )
    if provider == "mistral":
        return MistralClient(api_key=api_key, model=cfg.llm_providers.mistral.model)

    raise ValueError(f"Unsupported LLM provider: {provider}")


# --- Example Usage ---


async def main():
    """Example of how to use the LLM client factory."""
    # This main function is for example purposes.
    # In the actual application, settings are initialized in server.py.
    from backend.config import initialize_settings

    initialize_settings()

    print(f"Using active provider: {config.settings.active_provider}")
    try:
        client = get_llm_client()
        messages = [{"role": "user", "content": "Hello, who are you?"}]
        response = await client.get_completion(messages)
        print(f"Assistant response: {response}")
    except (LLMError, ValueError) as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    # To run this example, make sure you have an API key set in your env
    # for the active provider in your config.yaml
    asyncio.run(main())
