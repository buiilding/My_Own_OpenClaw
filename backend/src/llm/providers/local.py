import logging
from abc import abstractmethod
from typing import AsyncGenerator, Dict, List, Optional

import httpx
import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events import ChunkEvent, StreamingEvent
from backend.src.core.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.types import (
    LLMMessage,
    NormalizedLLMResponse,
)
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


class LocalLLMProvider(LLMProvider):
    """Base provider for local LLMs like Ollama and LMStudio."""

    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        params = self._build_request_params(model, messages)
        try:
            response = await litellm.acompletion(**params)
            if (
                not response
                or not response.choices
                or not response.choices[0].message
            ):
                raise LLMAPIError(
                    f"Invalid response from {self._provider_name()}",
                    model=model
                )
            content = response.choices[0].message.content or ""
            return {"content": content}
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError(
                f"{self._provider_name()} rate limit exceeded",
                model=model,
                cause=e
            )
        except litellm_exceptions.APIError as e:
            raise LLMAPIError(
                f"{self._provider_name()} API error",
                model=model,
                cause=e
            )
        except Exception as e:
            raise LLMError(
                f"An unexpected error occurred with {self._provider_name()}",
                model=model,
                cause=e
            )

    async def _stream_internal(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Internal streaming implementation for local providers.
        Exceptions bubble up to base class for uniform error handling.
        """
        params = self._build_request_params(model, messages)
        params["stream"] = True
        stream = await litellm.acompletion(**params)
        async for chunk in stream:
            if chunk and chunk.choices and chunk.choices[0].delta:
                content = chunk.choices[0].delta.content
                if content:
                    yield ChunkEvent(content=content)

    def _build_request_params(self, model: str, messages: List[LLMMessage]) -> dict:
        params = super()._build_request_params(model, messages)
        # Local models often need to be told they are compatible with OpenAI's API
        params["custom_llm_provider"] = "openai"
        if not params.get("api_key"):
            params["api_key"] = "placeholder"
        return params

    @abstractmethod
    def _provider_name(self) -> str:
        """Return the provider name for error messages."""
        pass


class OllamaProvider(LocalLLMProvider):
    """Provider for Ollama models."""

    def __init__(self, base_url: str, timeout: float = 60.0):
        """
        Initialize Ollama provider.
        
        Args:
            base_url: Base URL for Ollama API (e.g., "http://localhost:11434")
            timeout: Request timeout in seconds
        """
        # API key is not needed for Ollama
        super().__init__(api_key=None, base_url=base_url, timeout=timeout)

    def _validate_dependencies(self) -> None:
        """Validate that base_url is provided."""
        if not self.base_url:
            raise ValueError("OllamaProvider requires a valid 'base_url'.")

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("ollama/"):
            return model_id
        return f"ollama/{model_id}"

    def _provider_name(self) -> str:
        return "Ollama"

    async def list_models(self) -> List[Dict[str, str]]:
        """Fetch models from Ollama."""
        models = []
        # base_url is guaranteed to be a string (validated in __init__)
        # Handle the fact that config base_url usually ends in /v1 but api/tags is at root
        base_url = self.base_url
        if base_url.endswith("/v1"):
            base_url = base_url[:-3]
        
        url = f"{base_url.rstrip('/')}/api/tags"
        
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    if "models" in data:
                        for model in data["models"]:
                            model_name = model.get("name", "")
                            if model_name:
                                models.append({
                                    "id": model_name,
                                    "provider": "ollama",
                                    "display_name": model_name,
                                })
                else:
                    logger.warning(f"Ollama list models failed: {response.status_code}")
        except Exception as e:
            logger.warning(f"Error listing Ollama models: {e}")
            
        return models


class LMStudioProvider(LocalLLMProvider):
    """Provider for LMStudio models."""

    def __init__(self, base_url: str, timeout: float = 60.0):
        """
        Initialize LMStudio provider.
        
        Args:
            base_url: Base URL for LMStudio API (e.g., "http://localhost:1234/v1")
            timeout: Request timeout in seconds
        """
        # API key is not needed for LMStudio
        super().__init__(api_key=None, base_url=base_url, timeout=timeout)

    def _validate_dependencies(self) -> None:
        """Validate that base_url is provided."""
        if not self.base_url:
            raise ValueError("LMStudioProvider requires a valid 'base_url'.")

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("lmstudio/"):
            return model_id
        return f"lmstudio/{model_id}"

    def _provider_name(self) -> str:
        return "LMStudio"

    async def list_models(self) -> List[Dict[str, str]]:
        """Fetch models from LM Studio."""
        models = []
        # base_url is guaranteed to be a string (validated in __init__)
        # Config base_url usually includes /v1, which is what we want for /models
        url = f"{self.base_url.rstrip('/')}/models"
        
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    if "data" in data:
                        for model in data["data"]:
                            model_id = model.get("id", "")
                            if model_id:
                                models.append({
                                    "id": model_id,
                                    "provider": "lmstudio",
                                    "display_name": model_id,
                                })
                else:
                    logger.warning(f"LM Studio list models failed: {response.status_code}")
        except Exception as e:
            logger.warning(f"Error listing LM Studio models: {e}")
            
        return models
