from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional
import logging
import copy

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events.streaming_events import (
    ErrorEvent,
    StreamingEvent,
)
from backend.src.core.infrastructure.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.base_payload_compat_mixin import (
    ProviderPayloadCompatMixin,
)
from backend.src.llm.providers.error_mapping import (
    build_api_error_message,
    extract_status_code,
    iter_exception_chain,
)
from backend.src.llm.providers.stream_event_pipeline import (
    enable_stream_with_usage,
    stream_text_content_events,
    stream_thinking_and_text_events,
)
from backend.src.llm.providers.usage_diagnostics import (
    build_stream_cache_diagnostics,
    collect_usage_payload,
    extract_usage_int,
    normalize_usage_payload,
)
from backend.src.llm.request_kwargs import apply_prompt_cache_key

logger = logging.getLogger(__name__)


class LLMProvider(ProviderPayloadCompatMixin, ABC):
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
        self._last_usage: Optional[Dict[str, Any]] = None
        self._last_stream_response_payload: Optional[NormalizedLLMResponse] = None
        self._validate_dependencies()

    @abstractmethod
    def _validate_dependencies(self) -> None:
        """
        Validate that required dependencies are present.

        Raises:
            ValueError: If required dependencies are missing
        """
        pass

    def _require_api_key(self, provider_class_name: Optional[str] = None) -> None:
        """Raise a consistent missing-api-key error for providers that require it."""
        if self.api_key:
            return
        provider_name = provider_class_name or self.__class__.__name__
        raise ValueError(f"{provider_name} requires an 'api_key'.")

    @abstractmethod
    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
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
            self._record_usage_from_payload_container(response)
            return self._extract_completion_response(
                response,
                model=model,
                invalid_response_message=(
                    invalid_response_message
                    or f"Invalid response from {provider_label}"
                ),
            )
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError(
                f"{provider_label} rate limit exceeded",
                model=model,
                cause=e,
            )
        except litellm_exceptions.APIError as e:
            status_code = self._extract_status_code(e)
            raise LLMAPIError(
                self._build_api_error_message(provider_label, status_code),
                model=model,
                status_code=status_code,
                cause=e,
            )
        except LLMAPIError:
            raise
        except Exception as e:
            status_code = self._extract_status_code(e)
            if status_code is not None:
                raise LLMAPIError(
                    self._build_api_error_message(provider_label, status_code),
                    model=model,
                    status_code=status_code,
                    cause=e,
                )
            raise LLMError(
                f"An unexpected error occurred with {provider_label}",
                model=model,
                cause=e,
            )

    def _build_standard_completion_params(
        self,
        model: str,
        messages: List[LLMMessage],
        *,
        include_stream: bool = False,
        **request_kwargs: Any,
    ) -> Dict[str, Any]:
        """Build normalized completion params used by stream and non-stream calls."""
        params = self._build_request_params(
            model,
            messages,
            tools=request_kwargs.get("tools"),
            tool_choice=request_kwargs.get("tool_choice"),
            parallel_tool_calls=request_kwargs.get("parallel_tool_calls"),
            prompt_cache_key=request_kwargs.get("prompt_cache_key"),
        )
        if include_stream:
            self._enable_stream_with_usage(params)
        return params

    async def _get_completion_with_standard_params(
        self,
        *,
        provider_label: str,
        model: str,
        messages: List[LLMMessage],
        invalid_response_message: Optional[str] = None,
        **request_kwargs: Any,
    ) -> NormalizedLLMResponse:
        """Build params then execute completion with standard error mapping."""
        params = self._build_standard_completion_params(
            model,
            messages,
            tools=request_kwargs.get("tools"),
            tool_choice=request_kwargs.get("tool_choice"),
            parallel_tool_calls=request_kwargs.get("parallel_tool_calls"),
            prompt_cache_key=request_kwargs.get("prompt_cache_key"),
        )
        return await self._get_completion_with_standard_errors(
            provider_label=provider_label,
            model=model,
            params=params,
            invalid_response_message=invalid_response_message,
        )

    async def get_completion_stream(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
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
            async for event in self._stream_internal(
                model,
                messages,
                **request_kwargs,
            ):
                yield event
        except litellm_exceptions.RateLimitError as e:
            logger.error(f"Rate limit error in {self.__class__.__name__}: {e}")
            yield ErrorEvent(content="Rate limit exceeded. Please try again later.")
        except litellm_exceptions.APIError as e:
            logger.error(f"API error in {self.__class__.__name__}: {e}")
            yield ErrorEvent(content=f"External API error: {str(e)}")
        except Exception as e:
            logger.error(
                f"Unexpected error in {self.__class__.__name__}: {e}", exc_info=True
            )
            yield ErrorEvent(content=f"Unexpected system error: {str(e)}")

    def clear_last_stream_usage(self) -> None:
        """Reset stored usage payload for the next streaming request."""
        self._last_stream_usage = None
        self._last_usage = None
        self._last_stream_response_payload = None

    def get_last_stream_usage(self) -> Optional[Dict[str, Any]]:
        """Return a copy of the last captured usage payload."""
        if self._last_stream_usage is None:
            return None
        return copy.deepcopy(self._last_stream_usage)

    def get_last_usage(self) -> Optional[Dict[str, Any]]:
        """Return the most recent usage payload from stream or completion responses."""
        if self._last_usage is None:
            return None
        return copy.deepcopy(self._last_usage)

    def get_last_stream_response_payload(self) -> Optional[NormalizedLLMResponse]:
        """Return normalized payload captured from the most recent streaming request."""
        if self._last_stream_response_payload is None:
            return None
        return copy.deepcopy(self._last_stream_response_payload)

    def _set_last_stream_response_payload(self, payload: NormalizedLLMResponse) -> None:
        """Store normalized stream payload for downstream tool-call handling."""
        self._last_stream_response_payload = copy.deepcopy(payload)

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Return whether tool-enabled turns can safely use stream transport.

        Default is conservative: providers must opt in once stream payloads are
        known to reliably include final tool-call metadata.
        """
        _ = model
        return False

    def get_stream_cache_diagnostics(self, model: str) -> Dict[str, Any]:
        """
        Summarize provider-reported cache usage for the most recent stream.

        Returns:
            Dict with normalized cache diagnostics fields.
        """
        return build_stream_cache_diagnostics(
            model=model,
            usage=self.get_last_usage(),
        )

    def _record_stream_usage_from_chunk(self, chunk: Any) -> Optional[Dict[str, Any]]:
        """
        Capture usage payload if the provider includes one in a stream chunk.
        """
        captured = self._record_usage_from_payload_container(chunk)
        if captured:
            self._last_stream_usage = captured
        return captured

    def _record_usage_from_payload_container(
        self,
        payload_container: Any,
    ) -> Optional[Dict[str, Any]]:
        """Capture usage payloads from stream chunks or non-stream responses."""
        captured_usage = collect_usage_payload(payload_container)
        if captured_usage:
            self._last_usage = captured_usage
            return captured_usage
        return None

    @staticmethod
    def _iter_exception_chain(exc: Exception):
        """Yield exception and linked causes/contexts once each."""
        yield from iter_exception_chain(exc)

    @classmethod
    def _extract_status_code(cls, exc: Exception) -> Optional[int]:
        """Best-effort status-code extraction across wrapped provider exceptions."""
        _ = cls
        return extract_status_code(exc)

    @staticmethod
    def _build_api_error_message(
        provider_label: str, status_code: Optional[int]
    ) -> str:
        """Return concise, user-facing API error text."""
        return build_api_error_message(provider_label, status_code)

    @staticmethod
    def _normalize_usage_payload(payload: Any) -> Optional[Dict[str, Any]]:
        """Normalize provider usage payloads to plain dictionaries."""
        return normalize_usage_payload(payload)

    @staticmethod
    def _extract_usage_int(
        usage: Dict[str, Any],
        paths: List[tuple[str, ...]],
    ) -> Optional[int]:
        """Extract the first integer value from a list of nested dictionary paths."""
        return extract_usage_int(usage, paths)

    @abstractmethod
    async def _stream_internal(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Internal streaming implementation.

        DO NOT catch exceptions here; let them bubble up to get_completion_stream.
        Subclasses should only implement the streaming logic, not error handling.
        """
        _ = request_kwargs
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
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
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
            "messages": self._normalize_messages_for_provider(messages, model=model),
            "api_key": self.api_key,
            "base_url": self.base_url,
            "timeout": self.timeout,
        }
        if tools is not None:
            params["tools"] = self._normalize_tools_for_litellm(tools, model=model)
        if tool_choice is not None:
            params["tool_choice"] = tool_choice
        if parallel_tool_calls is not None:
            params["parallel_tool_calls"] = parallel_tool_calls
        apply_prompt_cache_key(params, prompt_cache_key)
        return self._apply_provider_request_params(params, model=model)

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
    ) -> Dict[str, Any]:
        """Provider hook for adding provider-specific LiteLLM request params."""
        _ = model
        return params

    @staticmethod
    def _enable_stream_with_usage(params: Dict[str, Any]) -> Dict[str, Any]:
        """Enable stream mode with usage payloads on provider request params."""
        return enable_stream_with_usage(params)

    async def _stream_text_content_events(
        self,
        params: Dict[str, Any],
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Stream request and yield text chunk events for providers without thinking deltas."""
        async for event in stream_text_content_events(
            params=params,
            record_stream_usage_from_chunk=self._record_stream_usage_from_chunk,
            extract_stream_delta=self._extract_stream_delta,
            extract_delta_content=self._extract_delta_content,
        ):
            yield event

    async def _stream_thinking_and_text_events(
        self,
        params: Dict[str, Any],
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Stream request and yield thinking + text events when provider returns thinking deltas."""
        async for event in stream_thinking_and_text_events(
            params=params,
            record_stream_usage_from_chunk=self._record_stream_usage_from_chunk,
            extract_stream_delta=self._extract_stream_delta,
            extract_thinking_content=self._extract_thinking_content,
            extract_delta_content=self._extract_delta_content,
        ):
            yield event

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
