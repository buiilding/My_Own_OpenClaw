from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional
import logging
import re
import copy
import json

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    StreamingEvent,
    ThinkingEvent,
)
from backend.src.core.infrastructure.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse

logger = logging.getLogger(__name__)
THINKING_TAG_PATTERN = re.compile(r"<thinking>(.*?)</thinking>", re.DOTALL)
HTTP_STATUS_CODE_PATTERN = re.compile(r"\b(?:status|error)\s+code\s+(\d{3})\b", re.IGNORECASE)
HTTP_SERVER_ERROR_PATTERN = re.compile(r"server error '?(\d{3})", re.IGNORECASE)


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
                    invalid_response_message or f"Invalid response from {provider_label}"
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
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
        *,
        include_stream: bool = False,
    ) -> Dict[str, Any]:
        """Build normalized completion params used by stream and non-stream calls."""
        params = self._build_request_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
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
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
        invalid_response_message: Optional[str] = None,
    ) -> NormalizedLLMResponse:
        """Build params then execute completion with standard error mapping."""
        params = self._build_standard_completion_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
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
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
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
                tools=tools,
                tool_choice=tool_choice,
                parallel_tool_calls=parallel_tool_calls,
                prompt_cache_key=prompt_cache_key,
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
                f"Unexpected error in {self.__class__.__name__}: {e}",
                exc_info=True
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

    def _set_last_stream_response_payload(
        self, payload: NormalizedLLMResponse
    ) -> None:
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
        usage = self.get_last_usage()
        if usage is None:
            return {
                "model": model,
                "status": "unknown",
                "cache_hit": None,
                "cached_tokens": None,
                "prompt_tokens": None,
                "completion_tokens": None,
                "thinking_tokens": None,
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
        thinking_tokens = self._extract_usage_int(
            usage,
            [
                ("completion_tokens_details", "reasoning_tokens"),
                ("output_tokens_details", "reasoning_tokens"),
                ("reasoning_tokens",),
                ("usage_metadata", "thoughts_token_count"),
                ("usageMetadata", "thoughtsTokenCount"),
                ("thoughts_token_count",),
                ("thoughtsTokenCount",),
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
            "thinking_tokens": thinking_tokens,
            "total_tokens": total_tokens,
            "reason": None,
        }

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
        payload_candidates: List[Any] = []
        if isinstance(payload_container, dict):
            payload_candidates.extend(
                [
                    payload_container.get("usage"),
                    payload_container.get("usage_metadata"),
                    payload_container.get("usageMetadata"),
                ]
            )
        else:
            payload_candidates.extend(
                [
                    getattr(payload_container, "usage", None),
                    getattr(payload_container, "usage_metadata", None),
                    getattr(payload_container, "usageMetadata", None),
                ]
            )
            model_extra = getattr(payload_container, "model_extra", None)
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
                self._last_usage = normalized
                return normalized
        return None

    @staticmethod
    def _iter_exception_chain(exc: Exception):
        """Yield exception and linked causes/contexts once each."""
        current: Optional[BaseException] = exc
        seen: set[int] = set()
        while current is not None and id(current) not in seen:
            seen.add(id(current))
            yield current
            current = current.__cause__ or current.__context__

    @classmethod
    def _extract_status_code(cls, exc: Exception) -> Optional[int]:
        """Best-effort status-code extraction across wrapped provider exceptions."""
        for candidate in cls._iter_exception_chain(exc):
            direct_code = getattr(candidate, "status_code", None)
            if isinstance(direct_code, int):
                return direct_code

            response = getattr(candidate, "response", None)
            response_code = getattr(response, "status_code", None)
            if isinstance(response_code, int):
                return response_code

            text = str(candidate)
            for pattern in (HTTP_STATUS_CODE_PATTERN, HTTP_SERVER_ERROR_PATTERN):
                match = pattern.search(text)
                if match:
                    try:
                        return int(match.group(1))
                    except ValueError:
                        continue
        return None

    @staticmethod
    def _build_api_error_message(provider_label: str, status_code: Optional[int]) -> str:
        """Return concise, user-facing API error text."""
        if status_code == 520:
            return (
                f"{provider_label} upstream service is temporarily unavailable (HTTP 520). "
                "Please retry."
            )
        if status_code is not None:
            return f"{provider_label} API error (HTTP {status_code})"
        return f"{provider_label} API error"

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
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
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
        if isinstance(prompt_cache_key, str):
            normalized_key = prompt_cache_key.strip()
            if normalized_key:
                params["prompt_cache_key"] = normalized_key
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
        params["stream"] = True
        params["stream_options"] = {"include_usage": True}
        return params

    async def _stream_text_content_events(
        self,
        params: Dict[str, Any],
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Stream request and yield text chunk events for providers without thinking deltas."""
        stream = await litellm.acompletion(**params)
        async for chunk in stream:
            self._record_stream_usage_from_chunk(chunk)
            delta = self._extract_stream_delta(chunk)
            content = self._extract_delta_content(delta)
            if content:
                yield ChunkEvent(content=content)

    async def _stream_thinking_and_text_events(
        self,
        params: Dict[str, Any],
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Stream request and yield thinking + text events when provider returns thinking deltas."""
        stream = await litellm.acompletion(**params)
        async for chunk in stream:
            self._record_stream_usage_from_chunk(chunk)
            delta = self._extract_stream_delta(chunk)
            if not delta:
                continue
            thinking_content = self._extract_thinking_content(delta)
            if thinking_content:
                yield ThinkingEvent(content=thinking_content)
            content = self._extract_delta_content(delta)
            if content:
                yield ChunkEvent(content=content)

    @staticmethod
    def _normalize_messages_for_provider(
        messages: List[LLMMessage],
        *,
        model: str,
    ) -> List[LLMMessage]:
        """
        Normalize message payloads for provider compatibility.

        - Convert assistant tool_calls from internal shape
          `{id,name,arguments}` into OpenAI shape
          `{id,type=function,function:{name,arguments:<json-string>}}`.
        - Drop orphan/invalid `role=tool` messages that reference missing
          assistant tool_call ids (Anthropic-compatible providers reject these).
        """
        if not isinstance(messages, list):
            raise TypeError(f"messages must be list, got {type(messages).__name__}")

        assistant_tool_call_ids: set[str] = set()
        normalized_messages: List[LLMMessage] = []
        changed = False

        for index, message in enumerate(messages):
            if not isinstance(message, dict):
                raise LLMAPIError(
                    f"Invalid message at index {index}: expected object",
                    model=model,
                )

            role = message.get("role")
            if role == "assistant":
                normalized_message, message_changed, tool_call_ids = (
                    LLMProvider._normalize_assistant_message_tool_calls(
                        message, index=index, model=model
                    )
                )
                assistant_tool_call_ids.update(tool_call_ids)
                normalized_messages.append(normalized_message)
                changed = changed or message_changed
                continue

            if role == "tool":
                tool_call_id = message.get("tool_call_id")
                if not isinstance(tool_call_id, str) or not tool_call_id.strip():
                    logger.warning(
                        "Dropping invalid tool message at index=%s: missing tool_call_id (model=%s)",
                        index,
                        model,
                    )
                    changed = True
                    continue
                if tool_call_id not in assistant_tool_call_ids:
                    logger.warning(
                        "Dropping orphan tool message at index=%s: tool_call_id='%s' has no assistant tool_calls match (model=%s)",
                        index,
                        tool_call_id,
                        model,
                    )
                    changed = True
                    continue

            normalized_messages.append(message)

        return normalized_messages if changed else messages

    @staticmethod
    def _normalize_assistant_message_tool_calls(
        message: Dict[str, Any],
        *,
        index: int,
        model: str,
    ) -> tuple[LLMMessage, bool, set[str]]:
        """Normalize assistant `tool_calls` entry and collect call ids."""
        raw_tool_calls = message.get("tool_calls")
        if raw_tool_calls is None:
            return message, False, set()
        if not isinstance(raw_tool_calls, list):
            raise LLMAPIError(
                f"Invalid assistant.tool_calls at message index {index}: expected list",
                model=model,
            )

        normalized_tool_calls: List[Dict[str, Any]] = []
        tool_call_ids: set[str] = set()
        changed = False
        for call_index, raw_call in enumerate(raw_tool_calls):
            normalized_call, was_changed = LLMProvider._normalize_assistant_tool_call_entry(
                raw_call,
                message_index=index,
                call_index=call_index,
                model=model,
            )
            changed = changed or was_changed
            normalized_tool_calls.append(normalized_call)
            call_id = normalized_call.get("id")
            if isinstance(call_id, str) and call_id:
                tool_call_ids.add(call_id)

        if changed:
            normalized_message = dict(message)
            normalized_message["tool_calls"] = normalized_tool_calls
            return normalized_message, True, tool_call_ids
        return message, False, tool_call_ids

    @staticmethod
    def _normalize_assistant_tool_call_entry(
        raw_call: Any,
        *,
        message_index: int,
        call_index: int,
        model: str,
    ) -> tuple[Dict[str, Any], bool]:
        """Normalize one assistant tool-call entry into OpenAI-compatible shape."""
        if not isinstance(raw_call, dict):
            raise LLMAPIError(
                f"Invalid tool_calls[{call_index}] at assistant message index {message_index}: expected object",
                model=model,
            )

        # Already OpenAI-compatible shape.
        if raw_call.get("type") == "function" and isinstance(raw_call.get("function"), dict):
            function_block = raw_call["function"]
            name = function_block.get("name")
            if not isinstance(name, str) or not name.strip():
                raise LLMAPIError(
                    f"Invalid tool_calls[{call_index}] at assistant message index {message_index}: function.name must be non-empty string",
                    model=model,
                )
            arguments = function_block.get("arguments")
            if isinstance(arguments, dict):
                normalized = copy.deepcopy(raw_call)
                normalized["function"]["arguments"] = json.dumps(
                    arguments, ensure_ascii=False, separators=(",", ":")
                )
                return normalized, True
            if arguments is None:
                normalized = copy.deepcopy(raw_call)
                normalized["function"]["arguments"] = "{}"
                return normalized, True
            if not isinstance(arguments, str):
                raise LLMAPIError(
                    f"Invalid tool_calls[{call_index}] at assistant message index {message_index}: function.arguments must be string/object",
                    model=model,
                )
            return raw_call, False

        # Internal runtime shape: {id, name, arguments}
        call_id = raw_call.get("id")
        if not isinstance(call_id, str) or not call_id.strip():
            raise LLMAPIError(
                f"Invalid tool_calls[{call_index}] at assistant message index {message_index}: id must be non-empty string",
                model=model,
            )
        name = raw_call.get("name")
        if not isinstance(name, str) or not name.strip():
            raise LLMAPIError(
                f"Invalid tool_calls[{call_index}] at assistant message index {message_index}: name must be non-empty string",
                model=model,
            )
        arguments = raw_call.get("arguments", {})
        if not isinstance(arguments, dict):
            raise LLMAPIError(
                f"Invalid tool_calls[{call_index}] at assistant message index {message_index}: arguments must be object",
                model=model,
            )

        return (
            {
                "id": call_id,
                "type": "function",
                "function": {
                    "name": name,
                    "arguments": json.dumps(
                        arguments, ensure_ascii=False, separators=(",", ":")
                    ),
                },
            },
            True,
        )

    @staticmethod
    def _normalize_tools_for_litellm(
        tools: List[Dict[str, Any]],
        *,
        model: str,
    ) -> List[Dict[str, Any]]:
        """
        Validate canonical tool schemas for LiteLLM transport.

        Runtime contract is strict: each entry must be
        `{type: "function", function: {name, description?, parameters}}`.
        """
        if not isinstance(tools, list):
            raise LLMAPIError(
                "Invalid tools payload: expected list of canonical tool objects",
                model=model,
            )

        normalized: List[Dict[str, Any]] = []
        for index, tool in enumerate(tools):
            normalized.append(
                LLMProvider._normalize_single_tool_for_litellm(
                    tool,
                    index=index,
                    model=model,
                )
            )
        return normalized

    @staticmethod
    def _normalize_single_tool_for_litellm(
        tool: Any,
        *,
        index: int,
        model: str,
    ) -> Dict[str, Any]:
        """Validate one canonical tool schema and return a deep copy."""
        if not isinstance(tool, dict):
            raise LLMAPIError(
                f"Invalid tool schema at index {index}: expected object",
                model=model,
            )

        tool_type = tool.get("type")
        if tool_type != "function":
            raise LLMAPIError(
                f"Invalid tool schema at index {index}: field 'type' must be 'function'",
                model=model,
            )

        function_payload = tool.get("function")
        if not isinstance(function_payload, dict):
            raise LLMAPIError(
                f"Invalid tool schema at index {index}: missing or invalid 'function' object",
                model=model,
            )

        function_name = function_payload.get("name")
        if not isinstance(function_name, str) or not function_name.strip():
            raise LLMAPIError(
                f"Invalid tool schema at index {index}: function.name must be a non-empty string",
                model=model,
            )

        if "parameters" not in function_payload:
            raise LLMAPIError(
                f"Invalid tool schema at index {index}: function.parameters is required",
                model=model,
            )
        parameters = function_payload.get("parameters")
        if not isinstance(parameters, dict):
            raise LLMAPIError(
                f"Invalid tool schema at index {index}: function.parameters must be an object",
                model=model,
            )

        description = function_payload.get("description")
        if description is not None and not isinstance(description, str):
            raise LLMAPIError(
                f"Invalid tool schema at index {index}: function.description must be a string when provided",
                model=model,
            )

        return copy.deepcopy(tool)

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
        choices = chunk.get("choices") if isinstance(chunk, dict) else getattr(chunk, "choices", None)
        first_choice = LLMProvider._first_item(choices)
        if not first_choice:
            return None
        if isinstance(first_choice, dict):
            return first_choice.get("delta")
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

        if isinstance(content, str):
            return content if content else None

        if isinstance(content, list):
            text_parts: List[str] = []
            for block in content:
                block_type = LLMProvider._get_value(block, "type")
                if block_type not in (None, "text"):
                    continue
                text_value = LLMProvider._get_value(block, "text")
                if isinstance(text_value, str) and text_value:
                    text_parts.append(text_value)
            if text_parts:
                return "".join(text_parts)

        if LLMProvider._delta_contains_tool_calls(delta):
            logger.info(
                "Streaming tool-call deltas detected; suppressing non-text delta content for safety."
            )
        return None

    @staticmethod
    def _extract_completion_content(
        response: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> str:
        """Extract completion text content from a LiteLLM response object."""
        normalized = LLMProvider._extract_completion_response(
            response,
            model=model,
            invalid_response_message=invalid_response_message,
        )
        return normalized["content"]

    @staticmethod
    def _extract_completion_response(
        response: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> NormalizedLLMResponse:
        """Extract normalized completion payload from a LiteLLM response object."""
        if not response:
            raise LLMAPIError(invalid_response_message, model=model)

        choices = LLMProvider._get_value(response, "choices")
        first_choice = LLMProvider._first_item(choices)
        message = LLMProvider._get_value(first_choice, "message") if first_choice else None
        if message is None:
            raise LLMAPIError(invalid_response_message, model=model)

        content = LLMProvider._extract_message_content(message)
        if not content:
            # Compatibility fallback for completion-style payloads that expose plain
            # text directly on the choice object instead of message.content.
            choice_text = LLMProvider._get_value(first_choice, "text")
            if isinstance(choice_text, str):
                content = choice_text
        normalized: NormalizedLLMResponse = {"content": content}

        tool_calls = LLMProvider._extract_message_tool_calls(
            message,
            model=model,
            invalid_response_message=invalid_response_message,
        )
        if tool_calls:
            normalized["tool_calls"] = tool_calls

        finish_reason = LLMProvider._get_value(first_choice, "finish_reason")
        if finish_reason is not None:
            normalized["finish_reason"] = str(finish_reason)

        return normalized

    @staticmethod
    def _extract_message_content(message: Any) -> str:
        """Extract assistant text content from a message payload."""
        # Some providers expose text directly on the message object.
        direct_text = (
            LLMProvider._get_value(message, "output_text")
            or LLMProvider._get_value(message, "text")
        )
        if isinstance(direct_text, str) and direct_text:
            return direct_text

        content = LLMProvider._get_value(message, "content")
        if content is None:
            return ""

        if isinstance(content, str):
            return content

        if isinstance(content, list):
            text_parts: List[str] = []
            for item in content:
                item_type = LLMProvider._get_value(item, "type")
                if item_type not in (None, "text", "output_text"):
                    continue
                text_value = (
                    LLMProvider._get_value(item, "text")
                    or LLMProvider._get_value(item, "content")
                )
                if isinstance(text_value, str):
                    if text_value:
                        text_parts.append(text_value)
                    continue
                if isinstance(text_value, dict):
                    nested_text = text_value.get("text") or text_value.get("content")
                    if isinstance(nested_text, str) and nested_text:
                        text_parts.append(nested_text)
            return "".join(text_parts)

        if isinstance(content, dict):
            text_value = content.get("text") or content.get("content")
            if isinstance(text_value, str):
                return text_value

        return str(content)

    @staticmethod
    def _extract_message_tool_calls(
        message: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> List[Dict[str, Any]]:
        """
        Normalize tool calls from OpenAI-style `message.tool_calls` or Anthropic-style
        `content` blocks (`type == tool_use`).
        """
        raw_tool_calls = LLMProvider._get_value(message, "tool_calls")
        normalized_calls: List[Dict[str, Any]] = []

        if raw_tool_calls:
            normalized_calls.extend(
                LLMProvider._normalize_raw_tool_calls(
                    raw_tool_calls,
                    model=model,
                    invalid_response_message=invalid_response_message,
                )
            )

        content_blocks = LLMProvider._get_value(message, "content")
        if isinstance(content_blocks, list):
            anthropic_blocks = [
                block
                for block in content_blocks
                if LLMProvider._get_value(block, "type") == "tool_use"
            ]
            if anthropic_blocks:
                normalized_calls.extend(
                    LLMProvider._normalize_raw_tool_calls(
                        anthropic_blocks,
                        model=model,
                        invalid_response_message=invalid_response_message,
                    )
                )

        deduped: List[Dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for call in normalized_calls:
            key = (call["id"], call["name"])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(call)
        return deduped

    @staticmethod
    def _normalize_raw_tool_calls(
        raw_tool_calls: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> List[Dict[str, Any]]:
        """Normalize heterogeneous raw tool-call payloads into canonical shape."""
        if isinstance(raw_tool_calls, (str, bytes, dict)):
            raise LLMAPIError(invalid_response_message, model=model)

        normalized_calls: List[Dict[str, Any]] = []
        for index, raw_tool_call in enumerate(raw_tool_calls):
            tool_id = LLMProvider._get_value(raw_tool_call, "id")
            function_payload = LLMProvider._get_value(raw_tool_call, "function")
            if function_payload is None and LLMProvider._get_value(raw_tool_call, "type") == "tool_use":
                function_payload = raw_tool_call

            tool_name = (
                LLMProvider._get_value(function_payload, "name")
                if function_payload is not None
                else LLMProvider._get_value(raw_tool_call, "name")
            )
            raw_arguments = (
                LLMProvider._get_value(function_payload, "arguments")
                if function_payload is not None
                else LLMProvider._get_value(raw_tool_call, "arguments")
            )
            if raw_arguments is None:
                raw_arguments = LLMProvider._get_value(raw_tool_call, "input")

            if not isinstance(tool_name, str) or not tool_name.strip():
                raise LLMAPIError(
                    f"{invalid_response_message}: invalid tool name at index {index}",
                    model=model,
                )

            if not isinstance(tool_id, str) or not tool_id.strip():
                tool_id = f"tool_call_{index}"
                logger.warning(
                    "Tool-call payload missing id; synthesizing fallback id='%s' (model=%s, name=%s)",
                    tool_id,
                    model,
                    tool_name,
                )

            arguments = LLMProvider._normalize_tool_arguments(
                raw_arguments,
                model=model,
                invalid_response_message=invalid_response_message,
            )
            normalized_calls.append(
                {
                    "id": tool_id,
                    "name": tool_name.strip(),
                    "arguments": arguments,
                }
            )

        return normalized_calls

    @staticmethod
    def _normalize_tool_arguments(
        raw_arguments: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> Dict[str, Any]:
        """Normalize tool call arguments to a dictionary payload."""
        if raw_arguments is None:
            return {}

        if isinstance(raw_arguments, dict):
            return copy.deepcopy(raw_arguments)

        if hasattr(raw_arguments, "model_dump"):
            try:
                dumped = raw_arguments.model_dump()
                if isinstance(dumped, dict):
                    return dumped
            except Exception:
                pass
        if hasattr(raw_arguments, "dict"):
            try:
                dumped = raw_arguments.dict()
                if isinstance(dumped, dict):
                    return dumped
            except Exception:
                pass

        if isinstance(raw_arguments, str):
            payload = raw_arguments.strip()
            if not payload:
                return {}
            try:
                decoded = json.loads(payload)
            except json.JSONDecodeError as exc:
                raise LLMAPIError(
                    f"{invalid_response_message}: invalid tool arguments JSON ({exc.msg})",
                    model=model,
                ) from exc
            if not isinstance(decoded, dict):
                raise LLMAPIError(
                    f"{invalid_response_message}: tool arguments must decode to object",
                    model=model,
                )
            return decoded

        raise LLMAPIError(
            f"{invalid_response_message}: unsupported tool arguments type {type(raw_arguments).__name__}",
            model=model,
        )

    @staticmethod
    def _get_value(source: Any, key: str) -> Any:
        """Get value from dict-like or object-like sources."""
        if source is None:
            return None
        if isinstance(source, dict):
            return source.get(key)
        return getattr(source, key, None)

    @staticmethod
    def _delta_contains_tool_calls(delta: Any) -> bool:
        """Best-effort detection for streaming tool-call deltas."""
        tool_calls = LLMProvider._get_value(delta, "tool_calls")
        if tool_calls:
            return True
        if LLMProvider._get_value(delta, "function_call"):
            return True

        content = LLMProvider._get_value(delta, "content")
        if isinstance(content, list):
            for block in content:
                if LLMProvider._get_value(block, "type") == "tool_use":
                    return True
        return False

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
