import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events import ChunkEvent, ErrorEvent, StreamingEvent, ThinkingEvent
from backend.src.core.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.types import (
    LLMMessage,
    NormalizedLLMResponse,
)
from backend.src.llm.models_config import ONLINE_THINKING_MODELS
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


class GeminiProvider(LLMProvider):
    """Provider for Google Gemini models."""

    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        params = self._build_request_params(model, messages)
        try:
            response = await litellm.acompletion(**params)
            # Basic validation
            if (
                not response
                or not response.choices
                or not response.choices[0].message
            ):
                raise LLMAPIError("Invalid response structure from Gemini", model=model)
            content = response.choices[0].message.content or ""
            return {"content": content}
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError("Gemini rate limit exceeded", model=model, cause=e)
        except litellm_exceptions.APIError as e:
            raise LLMAPIError("Gemini API error", model=model, cause=e)
        except Exception as e:
            raise LLMError("An unexpected error occurred with Gemini", model=model, cause=e)

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        params = self._build_request_params(model, messages)
        params["stream"] = True
        try:
            stream = await litellm.acompletion(**params)
            async for chunk in stream:
                if not chunk or not chunk.choices or not chunk.choices[0].delta:
                    continue

                delta = chunk.choices[0].delta
                thinking_content = self._extract_thinking_content(delta)
                if thinking_content:
                    yield ThinkingEvent(content=thinking_content)

                content = getattr(delta, "content", None)
                if content:
                    yield ChunkEvent(content=content)
        except Exception as e:
            logger.error(f"Error streaming from Gemini: {e}")
            yield ErrorEvent(content=str(e))

    async def list_models(self) -> List[Dict[str, str]]:
        """Lists available Gemini models."""
        # Return empty list as online models are handled by static config
        return []

    def _build_request_params(self, model: str, messages: List[LLMMessage]) -> dict:
        params = super()._build_request_params(model, messages)
        provider_name = "gemini"
        if (
            provider_name in ONLINE_THINKING_MODELS
            and model in ONLINE_THINKING_MODELS[provider_name]
        ):
            # Disable thinking tokens for Gemini models
            params["thinking"] = {"type": "disabled", "budget_tokens": 0}
        return params

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("gemini/"):
            return model_id
        return f"gemini/{model_id}"

    def _get_base_url(self, provider_config: Any) -> Optional[str]:
        return None

    def _extract_thinking_content(self, delta: Any) -> Optional[str]:
        """Extracts reasoning/thinking content from a LiteLLM delta."""
        # This is the brittle logic you pointed out. It now lives here,
        # isolated from the client.
        content = (
            getattr(delta, "reasoning_content", None)
            or getattr(delta, "thinking", None)
            or getattr(delta, "reasoning", None)
            or getattr(delta, "thought", None)
        )
        if isinstance(content, str):
            return content
        if isinstance(content, dict):
            return content.get("text") or content.get("content")
        return None
