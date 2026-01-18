import logging
from typing import AsyncGenerator, Dict, List, Optional

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


class OpenAIProvider(LLMProvider):
    """Provider for OpenAI models."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)

    def _validate_dependencies(self) -> None:
        """OpenAI requires an API key."""
        if not self.api_key:
            raise ValueError("OpenAIProvider requires an 'api_key'.")

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
                raise LLMAPIError("Invalid response from OpenAI", model=model)
            content = response.choices[0].message.content or ""
            return {"content": content}
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError("OpenAI rate limit exceeded", model=model, cause=e)
        except litellm_exceptions.APIError as e:
            raise LLMAPIError("OpenAI API error", model=model, cause=e)
        except Exception as e:
            raise LLMError("An unexpected error occurred with OpenAI", model=model, cause=e)

    async def _stream_internal(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Internal streaming implementation. Exceptions bubble up to base class."""
        params = self._build_request_params(model, messages)
        params["stream"] = True
        stream = await litellm.acompletion(**params)
        async for chunk in stream:
            if chunk and chunk.choices and chunk.choices[0].delta:
                content = chunk.choices[0].delta.content
                if content:
                    yield ChunkEvent(content=content)

    async def list_models(self) -> List[Dict[str, str]]:
        """
        Lists available OpenAI models.
        Note: For online providers, we typically use the static configuration
        instead of making API calls, to save on latency/rate limits.
        """
        return []

    def _get_full_model_string(self, model_id: str) -> str:
        return model_id
