import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent, ThinkingEvent
from backend.src.core.infrastructure.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.types.schemas import (
    LLMMessage,
    NormalizedLLMResponse,
)
from backend.src.llm.models.models_config import ONLINE_THINKING_MODELS
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)

# Default thinking token budget for Anthropic models that support thinking tokens
DEFAULT_THINKING_TOKEN_BUDGET = 16384


class AnthropicProvider(LLMProvider):
    """Provider for Anthropic models."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)

    def _validate_dependencies(self) -> None:
        """Anthropic requires an API key."""
        if not self.api_key:
            raise ValueError("AnthropicProvider requires an 'api_key'.")

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
                raise LLMAPIError("Invalid response from Anthropic", model=model)
            content = response.choices[0].message.content or ""
            return {"content": content}
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError("Anthropic rate limit exceeded", model=model, cause=e)
        except litellm_exceptions.APIError as e:
            raise LLMAPIError("Anthropic API error", model=model, cause=e)
        except Exception as e:
            raise LLMError("An unexpected error occurred with Anthropic", model=model, cause=e)

    async def _stream_internal(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Internal streaming implementation. Exceptions bubble up to base class."""
        params = self._build_request_params(model, messages)
        params["stream"] = True
        stream = await litellm.acompletion(**params)
        async for chunk in stream:
            delta = self._extract_stream_delta(chunk)
            if not delta:
                continue
            thinking_content = self._extract_thinking_content(delta)
            if thinking_content:
                yield ThinkingEvent(content=thinking_content)
            content = self._extract_delta_content(delta)
            if content:
                yield ChunkEvent(content=content)

    async def list_models(self) -> List[Dict[str, str]]:
        """Lists available Anthropic models."""
        return []

    def _build_request_params(self, model: str, messages: List[LLMMessage]) -> dict:
        params = super()._build_request_params(model, messages)
        provider_name = "anthropic"
        if (
            provider_name in ONLINE_THINKING_MODELS
            and model in ONLINE_THINKING_MODELS[provider_name]
        ):
            params["thinking"] = {"type": "enabled", "budget_tokens": DEFAULT_THINKING_TOKEN_BUDGET}
        return params

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("anthropic/"):
            return model_id
        return f"anthropic/{model_id}"
