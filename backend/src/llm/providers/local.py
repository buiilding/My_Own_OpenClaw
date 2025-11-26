import logging
from abc import abstractmethod
from typing import Any, AsyncGenerator, List, Optional

import litellm
from litellm import exceptions as litellm_exceptions

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
                raise LLMAPIError(f"Invalid response from {self._provider_name()}", model=model)
            content = response.choices[0].message.content or ""
            return {"content": content}
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError(f"{self._provider_name()} rate limit exceeded", model=model, cause=e)
        except litellm_exceptions.APIError as e:
            raise LLMAPIError(f"{self._provider_name()} API error", model=model, cause=e)
        except Exception as e:
            raise LLMError(f"An unexpected error occurred with {self._provider_name()}", model=model, cause=e)

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingChunk, None]:
        params = self._build_request_params(model, messages)
        params["stream"] = True
        try:
            stream = await litellm.acompletion(**params)
            async for chunk in stream:
                if chunk and chunk.choices and chunk.choices[0].delta:
                    content = chunk.choices[0].delta.content
                    if content:
                        yield {"type": "content", "content": content}
        except Exception as e:
            logger.error(f"Error streaming from {self._provider_name()}: {e}")
            yield {"type": "error", "content": str(e)}

    def _build_request_params(self, model: str, messages: List[LLMMessage]) -> dict:
        params = super()._build_request_params(model, messages)
        # Local models often need to be told they are compatible with OpenAI's API
        params["custom_llm_provider"] = "openai"
        if not params.get("api_key"):
            params["api_key"] = "placeholder"
        return params

    @abstractmethod
    def _provider_name(self) -> str:
        pass


class OllamaProvider(LocalLLMProvider):
    """Provider for Ollama models."""

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("ollama/"):
            return model_id
        return f"ollama/{model_id}"

    def _get_base_url(self, provider_config: Any) -> Optional[str]:
        return getattr(provider_config, "base_url", None)

    def _provider_name(self) -> str:
        return "Ollama"


class LMStudioProvider(LocalLLMProvider):
    """Provider for LMStudio models."""

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("lmstudio/"):
            return model_id
        return f"lmstudio/{model_id}"

    def _get_base_url(self, provider_config: Any) -> Optional[str]:
        return getattr(provider_config, "base_url", None)

    def _provider_name(self) -> str:
        return "LMStudio"
