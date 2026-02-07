import logging
from typing import AsyncGenerator, Dict, List, Optional

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent
from backend.src.core.infrastructure.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


class KimiCodingProvider(LLMProvider):
    """Provider for Kimi Coding (Anthropic-compatible endpoint)."""

    DEFAULT_BASE_URL = "https://api.kimi.com/coding"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        if base_url is None:
            base_url = self.DEFAULT_BASE_URL
        elif base_url.endswith("/v1"):
            base_url = base_url[: -len("/v1")]
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)

    def _validate_dependencies(self) -> None:
        """Kimi Coding requires an API key."""
        if not self.api_key:
            raise ValueError("KimiCodingProvider requires an 'api_key'.")

    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        params = self._build_request_params(model, messages)
        params["custom_llm_provider"] = "anthropic"
        try:
            response = await litellm.acompletion(**params)
            if (
                not response
                or not response.choices
                or not response.choices[0].message
            ):
                raise LLMAPIError("Invalid response from Kimi Coding", model=model)
            content = response.choices[0].message.content or ""
            return {"content": content}
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError("Kimi Coding rate limit exceeded", model=model, cause=e)
        except litellm_exceptions.APIError as e:
            raise LLMAPIError("Kimi Coding API error", model=model, cause=e)
        except Exception as e:
            raise LLMError(
                "An unexpected error occurred with Kimi Coding", model=model, cause=e
            )

    async def _stream_internal(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Internal streaming implementation. Exceptions bubble up to base class."""
        params = self._build_request_params(model, messages)
        params["custom_llm_provider"] = "anthropic"
        params["stream"] = True
        stream = await litellm.acompletion(**params)
        async for chunk in stream:
            delta = self._extract_stream_delta(chunk)
            content = self._extract_delta_content(delta)
            if content:
                yield ChunkEvent(content=content)

    async def list_models(self) -> List[Dict[str, str]]:
        """Lists available Kimi Coding models (static config preferred)."""
        return []

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id == "kimi-for-coding":
            return "k2p5"
        if model_id.startswith("kimi-coding/"):
            return model_id.split("/", 1)[1]
        if model_id.startswith("kimi-code/"):
            return model_id.split("/", 1)[1]
        if model_id.startswith("anthropic/"):
            return model_id.split("/", 1)[1]
        return model_id
