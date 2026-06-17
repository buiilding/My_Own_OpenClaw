"""OpenAI Responses API runtime for provider-native reasoning support."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, List, Optional
from urllib.parse import urlsplit

import litellm

from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    StreamingEvent,
    ThinkingEvent,
    WebSearchProgressEvent,
)
from backend.src.core.infrastructure.user_facing_errors import (
    OPENAI_RESPONSES_EMPTY_STREAM_MESSAGE,
)
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.openai_responses_input import (
    build_openai_responses_input,
    build_openai_responses_params,
)
from backend.src.llm.providers.openai_responses_payload import (
    normalize_openai_responses_payload,
    normalize_openai_stream_event_type,
)
from backend.src.llm.providers.response_parsing import get_value

_INVALID_OPENAI_RESPONSE = "Invalid response from OpenAI"
_REASONING_EVENT_TYPES = {
    "response.reasoning_summary_text.delta",
    "response.reasoning_text.delta",
}
_OUTPUT_TEXT_EVENT_TYPE = "response.output_text.delta"
_OUTPUT_ITEM_ADDED_EVENT_TYPE = "response.output_item.added"
_OUTPUT_ITEM_DONE_EVENT_TYPE = "response.output_item.done"
_FUNCTION_CALL_ARGUMENTS_DELTA_EVENT_TYPE = "response.function_call_arguments.delta"
_FUNCTION_CALL_ARGUMENTS_DONE_EVENT_TYPE = "response.function_call_arguments.done"
_WEB_SEARCH_IN_PROGRESS_EVENT_TYPE = "response.web_search_call.in_progress"
_WEB_SEARCH_SEARCHING_EVENT_TYPE = "response.web_search_call.searching"
_WEB_SEARCH_COMPLETED_EVENT_TYPE = "response.web_search_call.completed"
_WEB_SEARCH_PROGRESS_EVENT_TYPES = {
    _WEB_SEARCH_IN_PROGRESS_EVENT_TYPE,
    _WEB_SEARCH_SEARCHING_EVENT_TYPE,
    _WEB_SEARCH_COMPLETED_EVENT_TYPE,
}
_COMPLETED_EVENT_TYPE = "response.completed"
_INCOMPLETE_EVENT_TYPE = "response.incomplete"
_FAILED_EVENT_TYPE = "response.failed"
_ERROR_EVENT_TYPE = "error"
_MAX_FAILURE_EVENT_SUMMARIES = 3
_MAX_FAILURE_FIELD_CHARS = 180
_HTTP_STATUS_RE = re.compile(r"\b(?:HTTP\s*)?([45]\d{2})\b", re.IGNORECASE)
_RATE_LIMIT_RETRY_RE = re.compile(
    r"(?:try again|retry)\s+in\s+([0-9]+(?:\.[0-9]+)?)\s*(ms|milliseconds?|s|sec|secs|seconds?|m|mins?|minutes?)",
    re.IGNORECASE,
)
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _ResponsesFailureDetails:
    """Structured upstream failure captured from Responses stream events."""

    event_type: str
    response_id: Optional[str]
    response_status: Optional[str]
    error_type: Optional[str]
    error_code: Optional[str]
    error_param: Optional[str]
    error_message: Optional[str]
    status_code: Optional[int]
    retry_after_seconds: Optional[float]


def _build_reasoning_responses_params(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]],
    tool_choice: Any,
    parallel_tool_calls: Optional[bool],
    max_output_tokens: Optional[int],
    include_reasoning: bool,
    native_web_search_enabled: bool,
    previous_response_id: Optional[str],
) -> Dict[str, Any]:
    return build_openai_responses_params(
        provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
        max_output_tokens=max_output_tokens,
        include_reasoning=include_reasoning,
        native_web_search_enabled=native_web_search_enabled,
        previous_response_id=previous_response_id,
    )


async def get_openai_responses_completion(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = None,
    parallel_tool_calls: Optional[bool] = None,
    max_output_tokens: Optional[int] = None,
    native_web_search_enabled: bool = False,
    include_reasoning: bool = True,
    previous_response_id: Optional[str] = None,
) -> NormalizedLLMResponse:
    params = _build_reasoning_responses_params(
        provider=provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
        max_output_tokens=max_output_tokens,
        include_reasoning=include_reasoning,
        native_web_search_enabled=native_web_search_enabled,
        previous_response_id=previous_response_id,
    )
    response = await litellm.aresponses(**params)
    provider._record_usage_from_payload_container(response)
    return normalize_openai_responses_payload(provider, response, model=model)


def _maybe_build_reasoning_event(event: Any) -> Optional[ThinkingEvent]:
    if normalize_openai_stream_event_type(event) not in _REASONING_EVENT_TYPES:
        return None
    delta = get_value(event, "delta")
    if isinstance(delta, str) and delta:
        return ThinkingEvent(content=delta)
    return None


def _maybe_build_chunk_event(event: Any) -> Optional[ChunkEvent]:
    if normalize_openai_stream_event_type(event) != _OUTPUT_TEXT_EVENT_TYPE:
        return None
    delta = get_value(event, "delta")
    if isinstance(delta, str) and delta:
        return ChunkEvent(content=delta)
    return None


def _maybe_extract_response_id(event: Any) -> Optional[str]:
    response = get_value(event, "response")
    response_id = None
    if response is not None:
        response_id = get_value(response, "id")
    if response_id is None:
        response_id = get_value(event, "response_id")
    if isinstance(response_id, str) and response_id.strip():
        return response_id.strip()
    return None


def _build_fallback_stream_response_payload(
    *,
    content: str,
    response_id: Optional[str],
) -> NormalizedLLMResponse:
    fallback_payload: NormalizedLLMResponse = {
        "content": content,
        "finish_reason": "incomplete",
    }
    if isinstance(response_id, str) and response_id.strip():
        fallback_payload["response_id"] = response_id.strip()
    return fallback_payload


def _copy_response_output_item(item: Any) -> Dict[str, Any]:
    if isinstance(item, dict):
        return dict(item)

    copied: Dict[str, Any] = {}
    for key in (
        "type",
        "id",
        "call_id",
        "name",
        "arguments",
        "content",
        "status",
        "action",
        "sources",
    ):
        value = get_value(item, key)
        if value is not None:
            copied[key] = value
    return copied


def _response_output_item_key(
    event: Any,
    item: Any,
    *,
    fallback_index: int,
) -> str:
    for candidate in (
        get_value(event, "output_index"),
        get_value(event, "item_id"),
        get_value(item, "id"),
        get_value(item, "call_id"),
    ):
        if candidate is None:
            continue
        normalized = str(candidate).strip()
        if normalized:
            return normalized
    return f"stream-item-{fallback_index}"


def _event_output_item(event: Any) -> Any:
    item = get_value(event, "item")
    if item is not None:
        return item
    return get_value(event, "output_item")


def _extract_function_arguments_delta(event: Any) -> Optional[str]:
    for key in ("delta", "arguments_delta"):
        value = get_value(event, key)
        if isinstance(value, str) and value:
            return value
    return None


def _extract_function_arguments_done(event: Any) -> Optional[str]:
    for key in ("arguments", "delta"):
        value = get_value(event, key)
        if isinstance(value, str):
            return value
    return None


class _ResponsesStreamOutputAccumulator:
    """Builds a Responses-like payload from incremental output item events."""

    def __init__(self) -> None:
        self._pending_items: Dict[str, Dict[str, Any]] = {}
        self._pending_argument_deltas: Dict[str, List[str]] = {}
        self._completed_items: List[Dict[str, Any]] = []
        self._current_function_call_key: Optional[str] = None
        self._fallback_index = 0

    def process_event(self, event: Any) -> None:
        event_type = normalize_openai_stream_event_type(event)
        if event_type == _OUTPUT_ITEM_ADDED_EVENT_TYPE:
            self._record_added_item(event)
            return
        if event_type == _FUNCTION_CALL_ARGUMENTS_DELTA_EVENT_TYPE:
            self._append_function_arguments_delta(event)
            return
        if event_type == _FUNCTION_CALL_ARGUMENTS_DONE_EVENT_TYPE:
            self._complete_function_arguments(event)
            return
        if event_type == _OUTPUT_ITEM_DONE_EVENT_TYPE:
            self._record_done_item(event)

    def build_payload(
        self,
        provider: Any,
        *,
        model: str,
        accumulated_text: str,
        response_id: Optional[str],
    ) -> Optional[NormalizedLLMResponse]:
        if not self._completed_items:
            return None

        response: Dict[str, Any] = {
            "output": [dict(item) for item in self._completed_items],
            "status": "incomplete",
        }
        if isinstance(response_id, str) and response_id.strip():
            response["id"] = response_id.strip()

        payload = normalize_openai_responses_payload(
            provider,
            response,
            model=model,
        )
        if not payload.get("content") and accumulated_text:
            payload["content"] = accumulated_text
        return payload

    @property
    def completed_item_count(self) -> int:
        return len(self._completed_items)

    @property
    def pending_item_count(self) -> int:
        return len(self._pending_items)

    def _record_added_item(self, event: Any) -> None:
        item = _event_output_item(event)
        if item is None:
            return
        self._fallback_index += 1
        item_key = _response_output_item_key(
            event,
            item,
            fallback_index=self._fallback_index,
        )
        copied = _copy_response_output_item(item)
        self._pending_items[item_key] = copied
        if str(get_value(copied, "type") or "").strip() == "function_call":
            self._current_function_call_key = item_key
            raw_arguments = get_value(copied, "arguments")
            if isinstance(raw_arguments, str) and raw_arguments:
                self._pending_argument_deltas[item_key] = [raw_arguments]

    def _append_function_arguments_delta(self, event: Any) -> None:
        item_key = self._resolve_function_call_key(event)
        if item_key is None:
            return
        delta = _extract_function_arguments_delta(event)
        if delta is None:
            return
        self._pending_argument_deltas.setdefault(item_key, []).append(delta)

    def _complete_function_arguments(self, event: Any) -> None:
        item_key = self._resolve_function_call_key(event)
        if item_key is None:
            return
        arguments = _extract_function_arguments_done(event)
        if arguments is not None:
            self._pending_argument_deltas[item_key] = [arguments]

    def _record_done_item(self, event: Any) -> None:
        item = _event_output_item(event)
        if item is None:
            return
        self._fallback_index += 1
        item_key = _response_output_item_key(
            event,
            item,
            fallback_index=self._fallback_index,
        )
        pending_item = self._pending_items.pop(item_key, None)
        copied = dict(pending_item or {})
        copied.update(_copy_response_output_item(item))

        item_type = str(get_value(copied, "type") or "").strip()
        if item_type == "function_call":
            argument_deltas = self._pending_argument_deltas.pop(item_key, [])
            done_arguments = _extract_function_arguments_done(event)
            if argument_deltas and not get_value(copied, "arguments"):
                copied["arguments"] = "".join(argument_deltas)
            elif done_arguments is not None and not get_value(copied, "arguments"):
                copied["arguments"] = done_arguments
            if self._current_function_call_key == item_key:
                self._current_function_call_key = None

        if copied:
            self._completed_items.append(copied)

    def _resolve_function_call_key(self, event: Any) -> Optional[str]:
        item = _event_output_item(event)
        if item is not None:
            return _response_output_item_key(
                event,
                item,
                fallback_index=self._fallback_index,
            )

        for candidate in (
            get_value(event, "output_index"),
            get_value(event, "item_id"),
            get_value(event, "call_id"),
        ):
            if candidate is None:
                continue
            normalized = str(candidate).strip()
            if normalized:
                if (
                    normalized in self._pending_items
                    or normalized in self._pending_argument_deltas
                    or self._current_function_call_key is None
                ):
                    return normalized
                return self._current_function_call_key

        return self._current_function_call_key


class _ResponsesStreamDiagnostics:
    """Sanitized stream counters for missing-final-payload forensics."""

    def __init__(self) -> None:
        self.total_events = 0
        self.event_type_counts: Dict[str, int] = {}
        self.last_event_type = "<none>"
        self.last_event_keys: List[str] = []
        self.terminal_events = 0
        self.terminal_events_with_response = 0
        self.terminal_events_without_response = 0
        self.text_delta_events = 0
        self.reasoning_events = 0
        self.output_item_added_events = 0
        self.output_item_done_events = 0
        self.function_arguments_delta_events = 0
        self.function_arguments_done_events = 0
        self.web_search_events = 0
        self.failure_event_summaries: List[str] = []
        self.failure_details: Optional[_ResponsesFailureDetails] = None

    def record_event(self, event: Any) -> None:
        event_type = normalize_openai_stream_event_type(event) or "<missing>"
        self.total_events += 1
        self.event_type_counts[event_type] = (
            self.event_type_counts.get(event_type, 0) + 1
        )
        self.last_event_type = event_type
        self.last_event_keys = self._extract_event_keys(event)

        if event_type in {_COMPLETED_EVENT_TYPE, _INCOMPLETE_EVENT_TYPE}:
            self.terminal_events += 1
            if get_value(event, "response") is None:
                self.terminal_events_without_response += 1
            else:
                self.terminal_events_with_response += 1
        if event_type == _OUTPUT_TEXT_EVENT_TYPE:
            self.text_delta_events += 1
        elif event_type in _REASONING_EVENT_TYPES:
            self.reasoning_events += 1
        elif event_type == _OUTPUT_ITEM_ADDED_EVENT_TYPE:
            self.output_item_added_events += 1
        elif event_type == _OUTPUT_ITEM_DONE_EVENT_TYPE:
            self.output_item_done_events += 1
        elif event_type == _FUNCTION_CALL_ARGUMENTS_DELTA_EVENT_TYPE:
            self.function_arguments_delta_events += 1
        elif event_type == _FUNCTION_CALL_ARGUMENTS_DONE_EVENT_TYPE:
            self.function_arguments_done_events += 1
        elif event_type in _WEB_SEARCH_PROGRESS_EVENT_TYPES:
            self.web_search_events += 1

        if self._should_capture_failure_event(event, event_type):
            self._append_failure_event_summary(event, event_type)
            self._record_failure_details(event, event_type)

    def event_type_summary(self) -> str:
        if not self.event_type_counts:
            return "<none>"
        return ",".join(
            f"{event_type}:{count}"
            for event_type, count in sorted(self.event_type_counts.items())
        )

    def failure_event_summary(self) -> str:
        if not self.failure_event_summaries:
            return "<none>"
        return " | ".join(self.failure_event_summaries)

    def _append_failure_event_summary(self, event: Any, event_type: str) -> None:
        if len(self.failure_event_summaries) >= _MAX_FAILURE_EVENT_SUMMARIES:
            return
        summary = _build_failure_event_summary(event, event_type)
        if summary:
            self.failure_event_summaries.append(summary)

    def _record_failure_details(self, event: Any, event_type: str) -> None:
        details = _extract_failure_details(event, event_type)
        if details is None:
            return
        if self.failure_details is None or _failure_details_priority(
            details
        ) >= _failure_details_priority(self.failure_details):
            self.failure_details = details

    @staticmethod
    def _should_capture_failure_event(event: Any, event_type: str) -> bool:
        if event_type in {_ERROR_EVENT_TYPE, _FAILED_EVENT_TYPE}:
            return True
        if get_value(event, "error") is not None:
            return True
        response = get_value(event, "response")
        if response is None:
            return False
        return get_value(response, "error") is not None

    @staticmethod
    def _extract_event_keys(event: Any) -> List[str]:
        if isinstance(event, dict):
            return sorted(str(key) for key in event.keys())[:12]
        raw = getattr(event, "__dict__", None)
        if isinstance(raw, dict):
            return sorted(str(key) for key in raw.keys())[:12]
        return []


def _safe_log_field(
    value: Any, *, max_chars: int = _MAX_FAILURE_FIELD_CHARS
) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bool):
        text = str(value).lower()
    elif isinstance(value, (int, float)):
        text = str(value)
    elif isinstance(value, str):
        text = " ".join(value.split()).strip()
    else:
        return f"<{type(value).__name__}>"
    if not text:
        return None
    for marker in ("sk-", "Bearer "):
        marker_index = text.find(marker)
        if marker_index >= 0:
            text = f"{text[:marker_index]}{marker}<redacted>"
            break
    if len(text) > max_chars:
        return f"{text[: max_chars - 3].rstrip()}..."
    return text


def _append_failure_field(parts: List[str], name: str, value: Any) -> None:
    normalized = _safe_log_field(value)
    if normalized is not None:
        parts.append(f"{name}={normalized}")


def _build_failure_event_summary(event: Any, event_type: str) -> str:
    response = get_value(event, "response")
    event_error = get_value(event, "error")
    response_error = get_value(response, "error") if response is not None else None
    incomplete_details = (
        get_value(response, "incomplete_details") if response is not None else None
    )
    error_payload = response_error if response_error is not None else event_error

    parts: List[str] = [f"type={event_type}"]
    _append_failure_field(parts, "event_code", get_value(event, "code"))
    _append_failure_field(parts, "event_status", get_value(event, "status"))
    _append_failure_field(parts, "event_message", get_value(event, "message"))
    _append_failure_field(parts, "response_id", _maybe_extract_response_id(event))
    _append_failure_field(parts, "response_status", get_value(response, "status"))
    _append_failure_field(
        parts, "response_error_type", get_value(response_error, "type")
    )
    _append_failure_field(
        parts, "response_error_code", get_value(response_error, "code")
    )
    _append_failure_field(
        parts, "response_error_param", get_value(response_error, "param")
    )
    _append_failure_field(
        parts,
        "response_error_message",
        get_value(response_error, "message"),
    )
    _append_failure_field(parts, "error_type", get_value(event_error, "type"))
    _append_failure_field(parts, "error_code", get_value(event_error, "code"))
    _append_failure_field(parts, "error_param", get_value(event_error, "param"))
    _append_failure_field(parts, "error_message", get_value(error_payload, "message"))
    _append_failure_field(
        parts,
        "incomplete_reason",
        get_value(incomplete_details, "reason"),
    )
    return ";".join(parts)


def _extract_failure_details(
    event: Any,
    event_type: str,
) -> Optional[_ResponsesFailureDetails]:
    response = get_value(event, "response")
    response_error = get_value(response, "error") if response is not None else None
    event_error = get_value(event, "error")
    error_payload = response_error if response_error is not None else event_error
    if error_payload is None and event_type == _ERROR_EVENT_TYPE:
        error_payload = event

    if error_payload is None:
        return None

    error_message = _safe_log_field(get_value(error_payload, "message"))
    if error_message is None:
        error_message = _safe_log_field(get_value(event, "message"))

    error_code = _safe_log_field(get_value(error_payload, "code"))
    if error_code is None:
        error_code = _safe_log_field(get_value(event, "code"))

    error_type = _safe_log_field(get_value(error_payload, "type"))
    if error_type is None:
        error_type = _safe_log_field(get_value(event, "type"))

    status_code = _extract_failure_status_code(
        get_value(error_payload, "status_code"),
        get_value(response, "status"),
        get_value(event, "status"),
        error_code,
        error_message,
    )

    return _ResponsesFailureDetails(
        event_type=event_type,
        response_id=_maybe_extract_response_id(event),
        response_status=_safe_log_field(get_value(response, "status")),
        error_type=error_type,
        error_code=error_code,
        error_param=_safe_log_field(get_value(error_payload, "param")),
        error_message=error_message,
        status_code=status_code,
        retry_after_seconds=_extract_retry_after_seconds(error_payload, event),
    )


def _failure_details_priority(details: _ResponsesFailureDetails) -> int:
    if details.event_type == _FAILED_EVENT_TYPE and details.error_code:
        return 4
    if details.event_type == _FAILED_EVENT_TYPE:
        return 3
    if details.error_code or details.error_message:
        return 2
    return 1


def _extract_failure_status_code(*values: Any) -> Optional[int]:
    for value in values:
        if isinstance(value, int) and 400 <= value <= 599:
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.isdigit():
                parsed = int(stripped)
                if 400 <= parsed <= 599:
                    return parsed
            match = _HTTP_STATUS_RE.search(stripped)
            if match:
                return int(match.group(1))
    return None


def _coerce_retry_after_seconds(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and value >= 0:
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            parsed = float(stripped)
            if parsed >= 0:
                return parsed
        except ValueError:
            pass
    return None


def _extract_retry_after_seconds(*payloads: Any) -> Optional[float]:
    for payload in payloads:
        for key in ("retry_after_seconds", "retry_after", "retry-after"):
            delay = _coerce_retry_after_seconds(get_value(payload, key))
            if delay is not None:
                return delay

        message = get_value(payload, "message")
        if not isinstance(message, str):
            continue
        match = _RATE_LIMIT_RETRY_RE.search(message)
        if match is None:
            continue
        value = float(match.group(1))
        unit = match.group(2).lower()
        if unit.startswith("ms") or unit.startswith("millisecond"):
            return value / 1000
        if unit.startswith("m") and not unit.startswith("ms"):
            return value * 60
        return value
    return None


def _failure_code(details: _ResponsesFailureDetails) -> str:
    return str(details.error_code or "").strip().lower()


def _failure_type(details: _ResponsesFailureDetails) -> str:
    return str(details.error_type or "").strip().lower()


def _failure_message(details: _ResponsesFailureDetails) -> str:
    return str(details.error_message or "").strip()


def _looks_like_server_or_transport_failure(details: _ResponsesFailureDetails) -> bool:
    code = _failure_code(details)
    error_type = _failure_type(details)
    message = _failure_message(details).lower()
    return (
        details.status_code in {502, 503, 504}
        or (details.status_code is not None and 500 <= details.status_code <= 599)
        or error_type in {"server_error", "api_error"}
        or code
        in {
            "server_error",
            "upstream_failed",
            "temporarily_unavailable",
            "service_unavailable",
            "server_is_overloaded",
            "slow_down",
            "timeout",
            "gateway_timeout",
        }
        or any(
            marker in message
            for marker in (
                "upstream",
                "server error",
                "temporarily unavailable",
                "timed out",
                "timeout",
                "connection reset",
                "stream closed early",
            )
        )
    )


def _build_failure_error_event(
    *,
    model: str,
    fallback_response_id: Optional[str],
    details: _ResponsesFailureDetails,
) -> ErrorEvent:
    code = _failure_code(details)
    error_type = _failure_type(details)
    message = _failure_message(details)
    response_id = details.response_id or fallback_response_id

    error_kind = "provider_error"
    retryable = False
    transient = False
    content = message or OPENAI_RESPONSES_EMPTY_STREAM_MESSAGE

    if code == "context_length_exceeded":
        error_kind = "context_overflow"
        content = (
            f"context_length_exceeded: {message or 'maximum context length exceeded'}"
        )
    elif code in {"insufficient_quota", "quota_exceeded"}:
        error_kind = "quota"
        content = (
            message or "OpenAI quota exceeded. Check your plan and billing details."
        )
    elif code in {"invalid_prompt", "invalid_request_error", "invalid_request"}:
        error_kind = "invalid_request"
        content = message or "OpenAI rejected the request as invalid."
    elif code in {"cyber_policy", "content_policy", "policy_violation"}:
        error_kind = "policy"
        content = message or "OpenAI rejected the request for policy reasons."
    elif code in {"authentication_error", "invalid_api_key", "unauthorized"}:
        error_kind = "auth"
        content = message or "OpenAI authentication failed."
    elif code == "rate_limit_exceeded":
        error_kind = "rate_limit"
        retryable = True
        transient = True
        content = message or "OpenAI rate limit exceeded. Retrying shortly."
    elif _looks_like_server_or_transport_failure(details):
        error_kind = "server_error"
        retryable = True
        transient = True
        content = message or "OpenAI upstream service failed before completion."

    metadata: Dict[str, Any] = {
        "provider": "openai",
        "model": model,
        "response_id": response_id,
        "response_status": details.response_status,
        "response_event_type": details.event_type,
        "provider_error_type": details.error_type,
        "provider_error_code": details.error_code,
        "provider_error_param": details.error_param,
        "provider_error_message": details.error_message,
        "status_code": details.status_code,
        "error_kind": error_kind,
        "retryable": retryable,
        "transient": transient,
    }
    if details.retry_after_seconds is not None:
        metadata["retry_after_seconds"] = details.retry_after_seconds

    return ErrorEvent(content=content, metadata=metadata)


def _log_missing_final_payload_fallback(
    *,
    fallback: str,
    model: str,
    response_id: Optional[str],
    diagnostics: _ResponsesStreamDiagnostics,
    accumulated_text: str,
    saw_stream_content: bool,
    output_accumulator: _ResponsesStreamOutputAccumulator,
) -> None:
    logger.warning(
        "OpenAI Responses stream ended without a final response payload; "
        "fallback=%s model=%s response_id=%s events=%s event_types=%s "
        "last_event_type=%s terminal_events=%s terminal_with_response=%s "
        "terminal_without_response=%s text_delta_events=%s reasoning_events=%s "
        "output_item_added_events=%s output_item_done_events=%s "
        "function_arguments_delta_events=%s function_arguments_done_events=%s "
        "web_search_events=%s accumulated_text_chars=%s saw_stream_content=%s "
        "completed_output_items=%s pending_output_items=%s last_event_keys=%s "
        "failure_events=%s",
        fallback,
        model,
        response_id,
        diagnostics.total_events,
        diagnostics.event_type_summary(),
        diagnostics.last_event_type,
        diagnostics.terminal_events,
        diagnostics.terminal_events_with_response,
        diagnostics.terminal_events_without_response,
        diagnostics.text_delta_events,
        diagnostics.reasoning_events,
        diagnostics.output_item_added_events,
        diagnostics.output_item_done_events,
        diagnostics.function_arguments_delta_events,
        diagnostics.function_arguments_done_events,
        diagnostics.web_search_events,
        len(accumulated_text),
        saw_stream_content,
        output_accumulator.completed_item_count,
        output_accumulator.pending_item_count,
        (
            ",".join(diagnostics.last_event_keys)
            if diagnostics.last_event_keys
            else "<none>"
        ),
        diagnostics.failure_event_summary(),
    )


def _normalize_source_label(url: str) -> str:
    parsed = urlsplit(url)
    hostname = (parsed.netloc or parsed.path or "").strip().lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname or url.strip()


def _truncate_progress_label(text: str, *, max_chars: int = 96) -> str:
    normalized = " ".join(text.split()).strip()
    if len(normalized) <= max_chars:
        return normalized
    return f"{normalized[: max_chars - 3].rstrip()}..."


def _build_progress_url_label(
    url: str,
    *,
    source: Any = None,
) -> str:
    hostname = _normalize_source_label(url)
    title = get_value(source, "title")
    if isinstance(title, str) and title.strip():
        normalized_title = _truncate_progress_label(title)
        if normalized_title.lower() != hostname.lower():
            return f"{normalized_title} ({hostname})"

    parsed = urlsplit(url)
    path = parsed.path.strip("/")
    if path:
        path_label = _truncate_progress_label(path, max_chars=56)
        return f"{hostname}/{path_label}"

    return hostname


def _extract_web_search_context(
    event: Any,
) -> Optional[tuple[str, Any, Any, Optional[str], Optional[str], Optional[str]]]:
    event_type = normalize_openai_stream_event_type(event)
    if event_type == _OUTPUT_ITEM_DONE_EVENT_TYPE:
        item = get_value(event, "item")
    elif event_type in _WEB_SEARCH_PROGRESS_EVENT_TYPES:
        item = event
    else:
        return None

    item_type = str(get_value(item, "type") or "").strip()
    if (
        event_type not in _WEB_SEARCH_PROGRESS_EVENT_TYPES
        and item_type != "web_search_call"
    ):
        return None

    action = get_value(item, "action")
    if action is None:
        action = get_value(event, "action")
    action_type = str(get_value(action, "type") or "").strip() or None

    raw_query = (
        get_value(item, "query")
        or get_value(action, "query")
        or get_value(event, "query")
    )
    query = (
        raw_query.strip() if isinstance(raw_query, str) and raw_query.strip() else None
    )

    raw_item_id = (
        get_value(event, "item_id")
        or get_value(item, "item_id")
        or get_value(item, "call_id")
        or get_value(item, "id")
    )
    item_id = (
        raw_item_id.strip()
        if isinstance(raw_item_id, str) and raw_item_id.strip()
        else None
    )
    return event_type, item, action, action_type, query, item_id


def _extract_web_search_sources(
    *,
    event: Any,
    item: Any,
    action: Any,
) -> list[Any]:
    for candidate in (
        get_value(action, "sources"),
        get_value(item, "sources"),
        get_value(event, "sources"),
    ):
        if isinstance(candidate, list):
            return candidate
    return []


def _build_web_search_progress_events(
    event: Any,
    *,
    request_id: Optional[str],
    emitted_keys: set[str],
) -> list[WebSearchProgressEvent]:
    context = _extract_web_search_context(event)
    if context is None:
        return []
    event_type, item, action, action_type, item_query, item_id = context
    progress_events: list[WebSearchProgressEvent] = []

    def append_progress(
        *,
        text: str,
        key: str,
        query: Optional[str] = None,
        url: Optional[str] = None,
        pattern: Optional[str] = None,
    ) -> None:
        normalized_text = text.strip()
        if not normalized_text or key in emitted_keys:
            return
        emitted_keys.add(key)
        progress_events.append(
            WebSearchProgressEvent(
                text=normalized_text,
                request_id=request_id,
                action_type=action_type,
                query=query,
                url=url,
                pattern=pattern,
            )
        )

    raw_sources = _extract_web_search_sources(
        event=event,
        item=item,
        action=action,
    )
    if action_type == "search" or event_type in _WEB_SEARCH_PROGRESS_EVENT_TYPES:
        if raw_sources:
            for raw_source in raw_sources:
                url = get_value(raw_source, "url") or get_value(raw_source, "uri")
                if not isinstance(url, str) or not url.strip():
                    continue
                source_query = get_value(raw_source, "query")
                normalized_query = (
                    source_query.strip()
                    if isinstance(source_query, str) and source_query.strip()
                    else item_query
                )
                normalized_url = url.strip()
                append_progress(
                    text=f"Searched {_build_progress_url_label(normalized_url, source=raw_source)}",
                    key=f"search-source:{normalized_url}",
                    query=normalized_query,
                    url=normalized_url,
                )
            return progress_events

        raw_queries = get_value(action, "queries")
        if isinstance(raw_queries, list):
            for raw_query in raw_queries:
                if not isinstance(raw_query, str) or not raw_query.strip():
                    continue
                normalized_query = raw_query.strip()
                append_progress(
                    text=f"Searched web for {normalized_query}",
                    key=f"search-query:{normalized_query}",
                    query=normalized_query,
                )
        elif item_query:
            progress_verb = (
                "Searching"
                if event_type == _WEB_SEARCH_SEARCHING_EVENT_TYPE
                else "Searched"
            )
            append_progress(
                text=f"{progress_verb} web for {item_query}",
                key=f"search-query:{item_query}",
                query=item_query,
            )
        elif event_type == _WEB_SEARCH_SEARCHING_EVENT_TYPE:
            append_progress(
                text="Searching web",
                key="search-status:web-search",
            )
        return progress_events

    if action_type == "open_page":
        raw_url = get_value(action, "url")
        if isinstance(raw_url, str) and raw_url.strip():
            normalized_url = raw_url.strip()
            append_progress(
                text=f"Opened {_build_progress_url_label(normalized_url)}",
                key=f"open-page:{normalized_url}",
                url=normalized_url,
            )
        return progress_events

    if action_type == "find_in_page":
        raw_url = get_value(action, "url")
        raw_pattern = get_value(action, "pattern")
        if isinstance(raw_url, str) and raw_url.strip():
            normalized_url = raw_url.strip()
            normalized_pattern = (
                raw_pattern.strip()
                if isinstance(raw_pattern, str) and raw_pattern.strip()
                else None
            )
            text = (
                f"Searched {_build_progress_url_label(normalized_url)} for {normalized_pattern}"
                if normalized_pattern
                else f"Searched {_build_progress_url_label(normalized_url)}"
            )
            append_progress(
                text=text,
                key=f"find-in-page:{normalized_url}:{normalized_pattern or ''}",
                url=normalized_url,
                pattern=normalized_pattern,
            )
        return progress_events

    return []


def _maybe_extract_final_response_payload(
    provider: Any,
    event: Any,
    *,
    model: str,
) -> Optional[NormalizedLLMResponse]:
    if normalize_openai_stream_event_type(event) not in {
        _COMPLETED_EVENT_TYPE,
        _INCOMPLETE_EVENT_TYPE,
    }:
        return None
    response = get_value(event, "response")
    if response is None:
        return None
    provider._record_usage_from_payload_container(response)
    final_payload = normalize_openai_responses_payload(
        provider,
        response,
        model=model,
    )
    provider._set_last_stream_response_payload(final_payload)
    return final_payload


async def stream_openai_responses_events(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = None,
    parallel_tool_calls: Optional[bool] = None,
    max_output_tokens: Optional[int] = None,
    native_web_search_enabled: bool = False,
    include_reasoning: bool = True,
    request_id: Optional[str] = None,
    previous_response_id: Optional[str] = None,
) -> AsyncGenerator[StreamingEvent, None]:
    params = _build_reasoning_responses_params(
        provider=provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
        max_output_tokens=max_output_tokens,
        include_reasoning=include_reasoning,
        native_web_search_enabled=native_web_search_enabled,
        previous_response_id=previous_response_id,
    )
    params["stream"] = True

    stream = await litellm.aresponses(**params)
    final_response_payload: Optional[NormalizedLLMResponse] = None
    emitted_web_search_progress_keys: set[str] = set()
    output_accumulator = _ResponsesStreamOutputAccumulator()
    diagnostics = _ResponsesStreamDiagnostics()
    accumulated_text = ""
    last_response_id: Optional[str] = None
    saw_stream_content = False

    async for event in stream:
        diagnostics.record_event(event)
        extracted_response_id = _maybe_extract_response_id(event)
        if extracted_response_id is not None:
            last_response_id = extracted_response_id

        output_accumulator.process_event(event)

        reasoning_event = _maybe_build_reasoning_event(event)
        if reasoning_event is not None:
            saw_stream_content = True
            yield reasoning_event
            continue

        chunk_event = _maybe_build_chunk_event(event)
        if chunk_event is not None:
            saw_stream_content = True
            accumulated_text += chunk_event.content
            yield chunk_event
            continue

        for web_search_progress_event in _build_web_search_progress_events(
            event,
            request_id=request_id,
            emitted_keys=emitted_web_search_progress_keys,
        ):
            yield web_search_progress_event

        final_payload = _maybe_extract_final_response_payload(
            provider,
            event,
            model=model,
        )
        if final_payload is not None:
            final_response_payload = final_payload

    if final_response_payload is None:
        output_payload = output_accumulator.build_payload(
            provider,
            model=model,
            accumulated_text=accumulated_text,
            response_id=last_response_id,
        )
        if output_payload is not None:
            _log_missing_final_payload_fallback(
                fallback="completed_output_items",
                model=model,
                response_id=last_response_id,
                diagnostics=diagnostics,
                accumulated_text=accumulated_text,
                saw_stream_content=saw_stream_content,
                output_accumulator=output_accumulator,
            )
            provider._set_last_stream_response_payload(output_payload)
            return

        if accumulated_text.strip():
            _log_missing_final_payload_fallback(
                fallback="accumulated_text",
                model=model,
                response_id=last_response_id,
                diagnostics=diagnostics,
                accumulated_text=accumulated_text,
                saw_stream_content=saw_stream_content,
                output_accumulator=output_accumulator,
            )
            fallback_payload = _build_fallback_stream_response_payload(
                content=accumulated_text,
                response_id=last_response_id,
            )
            provider._set_last_stream_response_payload(fallback_payload)
            return

        if saw_stream_content:
            _log_missing_final_payload_fallback(
                fallback="stream_content_without_output",
                model=model,
                response_id=last_response_id,
                diagnostics=diagnostics,
                accumulated_text=accumulated_text,
                saw_stream_content=saw_stream_content,
                output_accumulator=output_accumulator,
            )
            fallback_payload = _build_fallback_stream_response_payload(
                content="",
                response_id=last_response_id,
            )
            provider._set_last_stream_response_payload(fallback_payload)
            return

        _log_missing_final_payload_fallback(
            fallback="empty_stream",
            model=model,
            response_id=last_response_id,
            diagnostics=diagnostics,
            accumulated_text=accumulated_text,
            saw_stream_content=saw_stream_content,
            output_accumulator=output_accumulator,
        )
        if diagnostics.failure_details is not None:
            yield _build_failure_error_event(
                model=model,
                fallback_response_id=last_response_id,
                details=diagnostics.failure_details,
            )
            return
        yield ErrorEvent(
            content=OPENAI_RESPONSES_EMPTY_STREAM_MESSAGE,
            metadata={
                "provider": "openai",
                "model": model,
                "response_id": last_response_id,
                "error_kind": "empty_responses_stream",
                "retryable": False,
                "transient": False,
            },
        )
