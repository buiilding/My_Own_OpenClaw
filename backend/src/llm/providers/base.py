from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional
import logging
import re
import copy

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events.streaming_events import ErrorEvent, StreamingEvent
from backend.src.core.infrastructure.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse

logger = logging.getLogger(__name__)
THINKING_TAG_PATTERN = re.compile(r"<thinking>(.*?)</thinking>", re.DOTALL)


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers.
    
    Enforces consistent error handling and dependency injection.
    Providers receive only the primitives they need, not the entire config object.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        """
        Initialize provider with only required dependencies.
        
        Args:
            api_key: API key for the provider (optional for local providers)
            base_url: Base URL for the provider API (optional for cloud providers)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self._last_stream_usage: Optional[Dict[str, Any]] = None
        self._validate_dependencies()

    @abstractmethod
    def _validate_dependencies(self) -> None:
        """
        Validate that required dependencies are present.
        
        Raises:
            ValueError: If required dependencies are missing
        """
        pass

    @abstractmethod
    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        """
        Gets a completion from the LLM and returns a normalized response.
        
        NOTE: Error handling differs from streaming:
        - Non-streaming (this method): Raises exceptions (LLMAPIError, LLMRateLimitError, LLMError)
        - Streaming (get_completion_stream): Catches exceptions and yields ErrorEvent
        
        This design allows callers to handle errors differently:
        - Non-streaming: Use try/except for control flow
        - Streaming: Process error events in the event stream
        """
        pass

    async def _get_completion_with_standard_errors(
        self,
        *,
        provider_label: str,
        model: str,
        params: Dict[str, Any],
        invalid_response_message: Optional[str] = None,
    ) -> NormalizedLLMResponse:
        """Execute a completion request with consistent error mapping."""
        try:
            response = await litellm.acompletion(**params)
            content = self._extract_completion_content(
                response,
                model=model,
                invalid_response_message=(
                    invalid_response_message or f"Invalid response from {provider_label}"
                ),
            )
            return {"content": content}
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError(
                f"{provider_label} rate limit exceeded",
                model=model,
                cause=e,
            )
        except litellm_exceptions.APIError as e:
            raise LLMAPIError(
                f"{provider_label} API error",
                model=model,
                cause=e,
            )
        except LLMAPIError:
            raise
        except Exception as e:
            raise LLMError(
                f"An unexpected error occurred with {provider_label}",
                model=model,
                cause=e,
            )

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Public streaming method with uniform error handling.
        
        All providers must yield events, never raise exceptions.
        This ensures Liskov Substitution Principle compliance.
        
        Errors are converted to ErrorEvent and yielded in the stream,
        allowing callers to handle errors as part of the event flow
        rather than via exception handling.
        """
        try:
            async for event in self._stream_internal(model, messages):
                yield event
        except litellm_exceptions.RateLimitError as e:
            logger.error(f"Rate limit error in {self.__class__.__name__}: {e}")
            yield ErrorEvent(content="Rate limit exceeded. Please try again later.")
        except litellm_exceptions.APIError as e:
            logger.error(f"API error in {self.__class__.__name__}: {e}")
            yield ErrorEvent(content=f"External API error: {str(e)}")
        except Exception as e:
            logger.error(
                f"Unexpected error in {self.__class__.__name__}: {e}",
                exc_info=True
            )
            yield ErrorEvent(content=f"Unexpected system error: {str(e)}")

    def clear_last_stream_usage(self) -> None:
        """Reset stored usage payload for the next streaming request."""
        self._last_stream_usage = None

    def get_last_stream_usage(self) -> Optional[Dict[str, Any]]:
        """Return a copy of the last captured usage payload."""
        if self._last_stream_usage is None:
            return None
        return copy.deepcopy(self._last_stream_usage)

    def get_stream_cache_diagnostics(self, model: str) -> Dict[str, Any]:
        """
        Summarize provider-reported cache usage for the most recent stream.

        Returns:
            Dict with normalized cache diagnostics fields.
        """
        usage = self.get_last_stream_usage()
        if usage is None:
            return {
                "model": model,
                "status": "unknown",
                "cache_hit": None,
                "cached_tokens": None,
                "prompt_tokens": None,
                "completion_tokens": None,
                "total_tokens": None,
                "reason": "provider_usage_unavailable",
            }

        cached_tokens = self._extract_usage_int(
            usage,
            [
                ("prompt_tokens_details", "cached_tokens"),
                ("input_tokens_details", "cached_tokens"),
                ("cache_read_input_tokens",),
                ("cached_content_token_count",),
                ("cachedContentTokenCount",),
                ("cached_tokens",),
                ("usage_metadata", "cached_content_token_count"),
                ("usageMetadata", "cachedContentTokenCount"),
            ],
        )
        prompt_tokens = self._extract_usage_int(
            usage,
            [
                ("prompt_tokens",),
                ("input_tokens",),
                ("prompt_token_count",),
                ("inputTokenCount",),
                ("usage_metadata", "prompt_token_count"),
                ("usageMetadata", "promptTokenCount"),
            ],
        )
        completion_tokens = self._extract_usage_int(
            usage,
            [
                ("completion_tokens",),
                ("output_tokens",),
                ("candidates_token_count",),
                ("outputTokenCount",),
                ("usage_metadata", "candidates_token_count"),
                ("usageMetadata", "candidatesTokenCount"),
            ],
        )
        total_tokens = self._extract_usage_int(
            usage,
            [
                ("total_tokens",),
                ("total_token_count",),
                ("totalTokenCount",),
                ("usage_metadata", "total_token_count"),
                ("usageMetadata", "totalTokenCount"),
            ],
        )

        if cached_tokens is None:
            status = "unknown"
            cache_hit = None
        elif cached_tokens > 0:
            status = "hit"
            cache_hit = True
        else:
            status = "miss"
            cache_hit = False

        return {
            "model": model,
            "status": status,
            "cache_hit": cache_hit,
            "cached_tokens": cached_tokens,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "reason": None,
        }

    def _record_stream_usage_from_chunk(self, chunk: Any) -> Optional[Dict[str, Any]]:
        """
        Capture usage payload if the provider includes one in a stream chunk.
        """
        payload_candidates: List[Any] = []
        if isinstance(chunk, dict):
            payload_candidates.extend(
                [
                    chunk.get("usage"),
                    chunk.get("usage_metadata"),
                    chunk.get("usageMetadata"),
                ]
            )
        else:
            payload_candidates.extend(
                [
                    getattr(chunk, "usage", None),
                    getattr(chunk, "usage_metadata", None),
                    getattr(chunk, "usageMetadata", None),
                ]
            )
            model_extra = getattr(chunk, "model_extra", None)
            if isinstance(model_extra, dict):
                payload_candidates.extend(
                    [
                        model_extra.get("usage"),
                        model_extra.get("usage_metadata"),
                        model_extra.get("usageMetadata"),
                    ]
                )

        for payload in payload_candidates:
            normalized = self._normalize_usage_payload(payload)
            if normalized:
                self._last_stream_usage = normalized
                return normalized
        return None

    @staticmethod
    def _normalize_usage_payload(payload: Any) -> Optional[Dict[str, Any]]:
        """Normalize provider usage payloads to plain dictionaries."""
        if payload is None:
            return None

        normalized = payload
        if hasattr(normalized, "model_dump"):
            try:
                normalized = normalized.model_dump()
            except Exception:
                normalized = payload
        elif hasattr(normalized, "dict"):
            try:
                normalized = normalized.dict()
            except Exception:
                normalized = payload
        elif hasattr(normalized, "__dict__") and not isinstance(normalized, dict):
            normalized = vars(normalized)

        if not isinstance(normalized, dict):
            return None

        return copy.deepcopy(normalized)

    @staticmethod
    def _extract_usage_int(
        usage: Dict[str, Any],
        paths: List[tuple[str, ...]],
    ) -> Optional[int]:
        """Extract the first integer value from a list of nested dictionary paths."""
        for path in paths:
            current: Any = usage
            found = True
            for key in path:
                if not isinstance(current, dict) or key not in current:
                    found = False
                    break
                current = current[key]
            if not found or current is None:
                continue

            if isinstance(current, bool):
                continue
            if isinstance(current, int):
                return current
            if isinstance(current, float) and current.is_integer():
                return int(current)
            if isinstance(current, str):
                stripped = current.strip()
                if stripped.isdigit():
                    return int(stripped)
        return None

    @abstractmethod
    async def _stream_internal(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Internal streaming implementation.
        
        DO NOT catch exceptions here; let them bubble up to get_completion_stream.
        Subclasses should only implement the streaming logic, not error handling.
        """
        pass

    @abstractmethod
    async def list_models(self) -> List[Dict[str, str]]:
        """
        Lists available models from the provider.

        Returns:
            List of model dictionaries with 'id', 'provider', and 'display_name'.
        """
        pass

    def _build_request_params(
        self,
        model: str,
        messages: List[LLMMessage],
        model_string: Optional[str] = None,
    ) -> dict:
        """
        Helper to construct the basic request parameters for LiteLLM.
        
        Args:
            model: Model identifier (must be non-empty string)
            messages: List of messages
            model_string: Optional pre-formatted model string (if None, uses _get_full_model_string)
        
        Raises:
            ValueError: If model is None or empty
        """
        # Validate model parameter
        if model is None:
            raise ValueError("model parameter cannot be None")
        if not isinstance(model, str):
            raise TypeError(f"model must be str, got {type(model).__name__}")
        if not model.strip():
            raise ValueError("model parameter cannot be empty or whitespace-only")
        if messages is None:
            raise ValueError("messages parameter cannot be None")
        if not isinstance(messages, list):
            raise TypeError(f"messages must be list, got {type(messages).__name__}")
        
        params = {
            "model": model_string or self._get_full_model_string(model),
            "messages": messages,
            "api_key": self.api_key,
            "base_url": self.base_url,
            "timeout": self.timeout,
        }
        return params

    @abstractmethod
    def _get_full_model_string(self, model_id: str) -> str:
        """
        Constructs the full model string required by LiteLLM.
        
        Args:
            model_id: Model identifier (guaranteed to be non-empty string by caller)
        
        Returns:
            Full model string for LiteLLM (e.g., "anthropic/claude-sonnet-4-5-20250929")
        
        Note:
            model_id is validated by _build_request_params before this is called.
            Subclasses can assume model_id is a valid non-empty string.
        """
        pass

    @staticmethod
    def _first_item(values: Any) -> Optional[Any]:
        """Return first item from indexable or iterable inputs, otherwise None."""
        if not values:
            return None
        if isinstance(values, (str, bytes, dict)):
            return None
        if isinstance(values, (list, tuple)):
            return values[0] if values else None
        try:
            return next(iter(values), None)
        except TypeError:
            return None

    def _extract_thinking_content(self, delta: Any) -> Optional[str]:
        """
        Extracts reasoning/thinking content from a LiteLLM delta.
        
        Shared implementation for Anthropic, Gemini, and other providers that support
        thinking tokens. Handles multiple formats:
        - Object attributes (reasoning_content, thinking, reasoning, thought)
        - Dictionary values
        - XML tags in content
        
        Args:
            delta: LiteLLM delta object or dictionary
            
        Returns:
            Extracted thinking content as string, or None if not found
        """
        # 1. Handle object attributes (Anthropic/Gemini SDKs)
        content = (
            getattr(delta, "reasoning_content", None)
            or getattr(delta, "thinking", None)
            or getattr(delta, "reasoning", None)
            or getattr(delta, "thought", None)
        )
        
        # 2. Handle dictionary format
        if not content and isinstance(delta, dict):
            content = (
                delta.get("reasoning_content")
                or delta.get("thinking")
                or delta.get("reasoning")
                or delta.get("thought")
            )

        # 2.5: Some providers include hidden reasoning inside delta.content tags.
        if not content:
            content = self._extract_tagged_thinking_from_content(delta)
        
        # 3. If content is a string, check for XML tags
        if isinstance(content, str):
            # Check for <thinking> tags (compiled once at module load).
            match = THINKING_TAG_PATTERN.search(content)
            if match:
                return match.group(1)
            return content
        
        # 4. If content is a dict, extract text/content
        if isinstance(content, dict):
            text_value = content.get("text") or content.get("content")
            if isinstance(text_value, str):
                return text_value
            return None
        
        return None

    @staticmethod
    def _extract_stream_delta(chunk: Any) -> Optional[Any]:
        """Extract stream delta payload from one LiteLLM stream chunk."""
        if not chunk:
            return None
        choices = getattr(chunk, "choices", None)
        first_choice = LLMProvider._first_item(choices)
        if not first_choice:
            return None
        return getattr(first_choice, "delta", None)

    @staticmethod
    def _extract_delta_content(delta: Any) -> Optional[str]:
        """Extract textual content from a stream delta payload."""
        if not delta:
            return None
        if isinstance(delta, dict):
            content = delta.get("content")
        else:
            content = getattr(delta, "content", None)
        if isinstance(content, str) and content:
            return content
        return None

    @staticmethod
    def _extract_completion_content(
        response: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> str:
        """Extract completion text content from a LiteLLM response object."""
        if not response:
            raise LLMAPIError(invalid_response_message, model=model)

        choices = getattr(response, "choices", None)
        first_choice = LLMProvider._first_item(choices)
        message = getattr(first_choice, "message", None) if first_choice else None
        if message is None:
            raise LLMAPIError(invalid_response_message, model=model)

        content = getattr(message, "content", None)
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        return str(content)

    @staticmethod
    def _extract_tagged_thinking_from_content(delta: Any) -> Optional[str]:
        """Extract <thinking>...</thinking> segments from delta.content fields."""
        raw_content = None
        if isinstance(delta, dict):
            raw_content = delta.get("content")
        else:
            raw_content = getattr(delta, "content", None)

        if not isinstance(raw_content, str):
            return None

        match = THINKING_TAG_PATTERN.search(raw_content)
        if not match:
            return None
        return match.group(1)
