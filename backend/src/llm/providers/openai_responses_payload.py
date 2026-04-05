"""Payload parsing helpers for the OpenAI Responses API runtime."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List

from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.core.types.schemas import NormalizedLLMResponse
from backend.src.core.utils.raw_tool_call_preview import build_raw_tool_call_preview
from backend.src.llm.providers.response_parsing import get_value
from backend.src.tools.web_search.source_normalization import extract_openai_web_search_sources

_INVALID_OPENAI_RESPONSE = "Invalid response from OpenAI"
_FUNCTION_CALL_ARGUMENTS_PREVIEW_CHARS = 4000


def normalize_openai_stream_event_type(event: Any) -> str:
    raw_type = get_value(event, "type")
    if raw_type is None:
        return ""
    value = getattr(raw_type, "value", raw_type)
    return str(value)


def preview_function_arguments(raw_arguments: str) -> str:
    payload = (raw_arguments or "").strip()
    if len(payload) <= _FUNCTION_CALL_ARGUMENTS_PREVIEW_CHARS:
        return payload
    return f"{payload[:_FUNCTION_CALL_ARGUMENTS_PREVIEW_CHARS]}...[truncated]"


def normalize_tool_call_arguments(provider: Any, raw_arguments: Any, *, model: str) -> Dict[str, Any]:
    return provider._normalize_tool_arguments(
        raw_arguments,
        model=model,
        invalid_response_message=_INVALID_OPENAI_RESPONSE,
    )


def iter_response_output_items(response: Any) -> Iterable[Any]:
    output = get_value(response, "output")
    if isinstance(output, list):
        yield from output


def _normalize_computer_actions(raw_actions: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_actions, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for action in raw_actions:
        if isinstance(action, dict):
            normalized.append(dict(action))
            continue
        model_dump = getattr(action, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump()
            if isinstance(dumped, dict):
                normalized.append(dumped)
                continue
        dict_method = getattr(action, "dict", None)
        if callable(dict_method):
            dumped = dict_method()
            if isinstance(dumped, dict):
                normalized.append(dumped)
    return normalized


def normalize_openai_responses_payload(
    provider: Any,
    response: Any,
    *,
    model: str,
) -> NormalizedLLMResponse:
    top_level_text = get_value(response, "output_text")
    message_text_parts: List[str] = []
    tool_calls: List[Dict[str, Any]] = []

    for item in iter_response_output_items(response):
        item_type = str(get_value(item, "type") or "").strip()
        if item_type == "message":
            content = get_value(item, "content")
            if isinstance(content, list):
                for block in content:
                    block_type = str(get_value(block, "type") or "").strip()
                    if block_type not in {"output_text", "text"}:
                        continue
                    text = get_value(block, "text") or get_value(block, "content")
                    if isinstance(text, str) and text:
                        message_text_parts.append(text)
            continue

        if item_type == "computer_call":
            call_id = str(
                get_value(item, "call_id")
                or get_value(item, "id")
                or f"tool_call_{len(tool_calls)}"
            )
            raw_actions = get_value(item, "actions")
            actions = [dict(action) for action in raw_actions] if isinstance(raw_actions, list) else []
            tool_calls.append(
                {
                    "id": call_id,
                    "name": "computer",
                    "arguments": {"actions": _normalize_computer_actions(raw_actions)},
                }
            )
            continue

        if item_type == "function_call":
            raw_arguments = get_value(item, "arguments")
            try:
                arguments = normalize_tool_call_arguments(provider, raw_arguments, model=model)
            except LLMAPIError as exc:
                preview = preview_function_arguments(str(raw_arguments or ""))
                tool_call_id = str(
                    get_value(item, "call_id")
                    or get_value(item, "id")
                    or f"tool_call_{len(tool_calls)}"
                )
                tool_name = str(get_value(item, "name") or "")
                raw_tool_call_preview = build_raw_tool_call_preview(
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    raw_arguments_preview=preview,
                )
                raise LLMAPIError(
                    (
                        f"{_INVALID_OPENAI_RESPONSE}: failed to parse Responses API tool-call arguments "
                        f"for name={tool_name!r}."
                    ),
                    model=model,
                    metadata={
                        "llm_tool_call_parse_failed": True,
                        "llm_tool_call_id": tool_call_id,
                        "llm_tool_name": tool_name,
                        "llm_tool_call_raw_tool_call_preview": raw_tool_call_preview,
                        "llm_tool_call_raw_arguments_preview": preview,
                        "llm_tool_call_raw_arguments_preview_truncated": preview.endswith("...[truncated]"),
                    },
                ) from exc

            tool_calls.append(
                {
                    "id": str(
                        get_value(item, "call_id")
                        or get_value(item, "id")
                        or f"tool_call_{len(tool_calls)}"
                    ),
                    "name": str(get_value(item, "name") or ""),
                    "arguments": arguments,
                }
            )

    if message_text_parts:
        content = "".join(message_text_parts)
    elif isinstance(top_level_text, str):
        content = top_level_text
    else:
        content = ""

    normalized: NormalizedLLMResponse = {"content": content}
    if tool_calls:
        normalized["tool_calls"] = tool_calls
    web_search_sources = extract_openai_web_search_sources(response)
    if web_search_sources:
        normalized["web_search_sources"] = web_search_sources
    finish_reason = get_value(response, "status")
    if isinstance(finish_reason, str):
        normalized["finish_reason"] = finish_reason
    response_id = get_value(response, "id")
    if isinstance(response_id, str) and response_id:
        normalized["response_id"] = response_id
    return normalized
