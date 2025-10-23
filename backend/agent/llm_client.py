"""
Abstraction layer for communicating with multiple LLM providers.

This module provides a unified interface for interacting with different
Large Language Models (LLMs) like OpenAI, Anthropic, and Google. It uses a
factory pattern to instantiate the correct client based on the application's
configuration.
"""

import asyncio
from abc import ABC, abstractmethod
from typing import Dict, List

import anthropic
import google.generativeai as genai
import openai

from backend.config import AppConfig, settings

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
        pass


# --- Concrete Implementations for Each Provider ---


class OpenAIClient(LLMClient):
    """LLM client for OpenAI models."""

    def __init__(self, api_key: str, model: str):
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.model = model

    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
            )
            return response.choices[0].message.content or ""
        except openai.RateLimitError as e:
            raise RateLimitError(f"OpenAI rate limit exceeded: {e}") from e
        except openai.APIError as e:
            raise APIError(f"OpenAI API error: {e}") from e


class AnthropicClient(LLMClient):
    """LLM client for Anthropic (Claude) models."""

    def __init__(self, api_key: str, model: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

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
            return response.content[0].text
        except anthropic.RateLimitError as e:
            raise RateLimitError(f"Anthropic rate limit exceeded: {e}") from e
        except anthropic.APIError as e:
            raise APIError(f"Anthropic API error: {e}") from e


class GoogleClient(LLMClient):
    """LLM client for Google (Gemini) models."""

    def __init__(self, api_key: str, model: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model)

    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            # Gemini uses a different format for roles
            gemini_messages = [
                {
                    "role": "user" if m["role"] == "user" else "model",
                    "parts": [m["content"]],
                }
                for m in messages
            ]
            response = await self.model.generate_content_async(gemini_messages)
            return response.text
        except Exception as e:
            # The Google SDK has a less specific error hierarchy, so we catch broadly
            raise APIError(f"Google API error: {e}") from e


class OllamaClient(LLMClient):
    """LLM client for local Ollama models."""

    def __init__(self, base_url: str, model: str):
        # Ollama uses the OpenAI SDK, but with a custom base_url and no API key
        self.client = openai.AsyncOpenAI(base_url=base_url, api_key="ollama")
        self.model = model

    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
            )
            return response.choices[0].message.content or ""
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

    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
            )
            return response.choices[0].message.content or ""
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

    async def get_completion(self, messages: List[Dict[str, str]]) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
            )
            return response.choices[0].message.content or ""
        except openai.RateLimitError as e:
            raise RateLimitError(f"Mistral AI rate limit exceeded: {e}") from e
        except openai.APIError as e:
            raise APIError(f"Mistral AI API error: {e}") from e


# --- Factory Function to Get the Correct Client ---


def get_llm_client(config: AppConfig = settings) -> LLMClient:
    """
    Factory function to get an instance of the correct LLM client based on config.

    Args:
        config: The application's configuration object.

    Returns:
        An instance of a class that implements the LLMClient interface.

    Raises:
        ValueError: If the configured provider is not supported.
    """
    provider = config.active_provider
    api_key = config.api_key

    if provider == "openai":
        return OpenAIClient(api_key=api_key, model=config.llm_providers.openai.model)
    if provider == "anthropic":
        return AnthropicClient(
            api_key=api_key, model=config.llm_providers.anthropic.model
        )
    if provider == "google":
        return GoogleClient(api_key=api_key, model=config.llm_providers.google.model)
    if provider == "ollama":
        return OllamaClient(
            base_url=config.llm_providers.ollama.base_url,
            model=config.llm_providers.ollama.model,
        )
    if provider == "openrouter":
        return OpenRouterClient(
            api_key=api_key, model=config.llm_providers.openrouter.model
        )
    if provider == "mistral":
        return MistralClient(api_key=api_key, model=config.llm_providers.mistral.model)

    raise ValueError(f"Unsupported LLM provider: {provider}")


# --- Example Usage ---


async def main():
    """Example of how to use the LLM client factory."""
    print(f"Using active provider: {settings.active_provider}")
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
