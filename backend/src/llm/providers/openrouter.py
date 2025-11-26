import logging
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


class OpenRouterProvider(LLMProvider):
    """Provider for OpenRouter."""

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
                raise LLMAPIError("Invalid response from OpenRouter", model=model)
            content = response.choices[0].message.content or ""
            return {"content": content}
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError("OpenRouter rate limit exceeded", model=model, cause=e)
        except litellm_exceptions.APIError as e:
            raise LLMAPIError("OpenRouter API error", model=model, cause=e)
        except Exception as e:
            raise LLMError("An unexpected error occurred with OpenRouter", model=model, cause=e)

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
            logger.error(f"Error streaming from OpenRouter: {e}")
            yield {"type": "error", "content": str(e)}

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("openrouter/"):
            return model_id
        return f"openrouter/{model_id}"

    def _get_base_url(self, provider_config: Any) -> Optional[str]:
        return getattr(provider_config, "base_url", "https://openrouter.ai/api/v1")
