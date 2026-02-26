"""Shared response/stream parsing helpers for provider payload normalization."""

from __future__ import annotations

import copy
import json
import logging
import re
from typing import Any, Dict, List, Optional

from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.core.types.schemas import NormalizedLLMResponse

logger = logging.getLogger(__name__)
THINKING_TAG_PATTERN = re.compile(r"<(thinking|think)>(.*?)</\1>", re.IGNORECASE | re.DOTALL)


def first_item(values: Any) -> Optional[Any]:
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


def get_value(source: Any, key: str) -> Any:
    """Get value from dict-like or object-like sources."""
    if source is None:
        return None
    if isinstance(source, dict):
        return source.get(key)
    return getattr(source, key, None)


def delta_contains_tool_calls(delta: Any) -> bool:
    """Best-effort detection for streaming tool-call deltas."""
    tool_calls = get_value(delta, "tool_calls")
    if tool_calls:
        return True
    if get_value(delta, "function_call"):
        return True

    content = get_value(delta, "content")
    if isinstance(content, list):
        for block in content:
            if get_value(block, "type") == "tool_use":
                return True
    return False


def extract_tagged_thinking_from_content(delta: Any) -> Optional[str]:
    """Extract <thinking>...</thinking> segments from delta.content fields."""
    if isinstance(delta, dict):
        raw_content = delta.get("content")
    else:
        raw_content = getattr(delta, "content", None)

    if not isinstance(raw_content, str):
        return None

    match = THINKING_TAG_PATTERN.search(raw_content)
    if not match:
        return None
    return match.group(2)


def _extract_string_content(value: Any) -> Optional[str]:
    """Extract first non-empty string from common reasoning payload shapes."""
    if isinstance(value, str):
        return value if value else None
    if isinstance(value, dict):
        for key in (
            "text",
            "content",
            "reasoning_content",
            "reasoningContent",
            "thinking",
            "thinking_content",
            "reasoning",
            "thought",
            "thoughts",
        ):
            nested = value.get(key)
            if isinstance(nested, str) and nested:
                return nested
    return None


def _extract_thinking_from_content_blocks(delta: Any) -> Optional[str]:
    """
    Extract reasoning text from structured delta.content block lists.

    Some providers emit chain-of-thought deltas as block arrays where each block
    carries `type=thinking|reasoning|thought` plus a text-like field.
    """
    content_blocks = (
        delta.get("content")
        if isinstance(delta, dict)
        else getattr(delta, "content", None)
    )
    if not isinstance(content_blocks, list):
        return None

    for block in content_blocks:
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type") or "").lower()
        if block_type not in {"thinking", "reasoning", "thought"}:
            continue
        extracted = _extract_string_content(block)
        if extracted:
            return extracted
    return None


def _extract_reasoning_field_from_object(delta: Any) -> Any:
    """Read supported reasoning fields from object-like deltas."""
    for field_name in (
        "reasoning_content",
        "reasoningContent",
        "thinking_content",
        "thinking",
        "reasoning",
        "thought",
        "thoughts",
    ):
        value = getattr(delta, field_name, None)
        if value is None:
            continue
        if isinstance(value, (str, dict, list)):
            return value
    return None


def extract_thinking_content(delta: Any) -> Optional[str]:
    """
    Extract reasoning/thinking content from a LiteLLM delta.

    Handles:
    - object attributes (`reasoning_content`, `thinking`, `reasoning`, `thought`)
    - dictionary keys of same names
    - tagged `<thinking>...</thinking>` content.
    """
    content = _extract_reasoning_field_from_object(delta)

    if not content and isinstance(delta, dict):
        content = (
            delta.get("reasoning_content")
            or delta.get("reasoningContent")
            or delta.get("thinking_content")
            or delta.get("thinking")
            or delta.get("reasoning")
            or delta.get("thought")
            or delta.get("thoughts")
        )

    if not content:
        content = _extract_thinking_from_content_blocks(delta)

    if not content:
        content = extract_tagged_thinking_from_content(delta)

    extracted_string = _extract_string_content(content)
    if extracted_string:
        match = THINKING_TAG_PATTERN.search(extracted_string)
        if match:
            return match.group(2)
        return extracted_string

    return None


def extract_stream_delta(chunk: Any) -> Optional[Any]:
    """Extract stream delta payload from one LiteLLM stream chunk."""
    if not chunk:
        return None
    choices = chunk.get("choices") if isinstance(chunk, dict) else getattr(chunk, "choices", None)
    first_choice = first_item(choices)
    if not first_choice:
        return None
    if isinstance(first_choice, dict):
        return first_choice.get("delta")
    return getattr(first_choice, "delta", None)


def extract_stream_finish_reason(chunk: Any) -> Optional[str]:
    """Extract finish_reason from a stream chunk when present."""
    if not chunk:
        return None
    choices = chunk.get("choices") if isinstance(chunk, dict) else getattr(chunk, "choices", None)
    first_choice = first_item(choices)
    if first_choice is None:
        return None
    finish_reason = get_value(first_choice, "finish_reason")
    if finish_reason is None:
        return None
    return str(finish_reason)


def extract_delta_content(delta: Any) -> Optional[str]:
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
            block_type = get_value(block, "type")
            if block_type not in (None, "text"):
                continue
            text_value = get_value(block, "text")
            if isinstance(text_value, str) and text_value:
                text_parts.append(text_value)
        if text_parts:
            return "".join(text_parts)

    if delta_contains_tool_calls(delta):
        logger.info(
            "Streaming tool-call deltas detected; suppressing non-text delta content for safety."
        )
    return None


def extract_completion_content(
    response: Any,
    *,
    model: str,
    invalid_response_message: str,
) -> str:
    """Extract completion text content from a LiteLLM response object."""
    normalized = extract_completion_response(
        response,
        model=model,
        invalid_response_message=invalid_response_message,
    )
    return normalized["content"]


def extract_completion_response(
    response: Any,
    *,
    model: str,
    invalid_response_message: str,
) -> NormalizedLLMResponse:
    """Extract normalized completion payload from a LiteLLM response object."""
    if not response:
        raise LLMAPIError(invalid_response_message, model=model)

    choices = get_value(response, "choices")
    first_choice = first_item(choices)
    message = get_value(first_choice, "message") if first_choice else None
    if message is None:
        raise LLMAPIError(invalid_response_message, model=model)

    content = extract_message_content(message)
    if not content:
        # Compatibility fallback for completion-style payloads that expose plain
        # text directly on the choice object instead of message.content.
        choice_text = get_value(first_choice, "text")
        if isinstance(choice_text, str):
            content = choice_text
    normalized: NormalizedLLMResponse = {"content": content}

    tool_calls = extract_message_tool_calls(
        message,
        model=model,
        invalid_response_message=invalid_response_message,
    )
    if tool_calls:
        normalized["tool_calls"] = tool_calls

    finish_reason = get_value(first_choice, "finish_reason")
    if finish_reason is not None:
        normalized["finish_reason"] = str(finish_reason)

    return normalized


def extract_message_content(message: Any) -> str:
    """Extract assistant text content from a message payload."""
    direct_text = get_value(message, "output_text") or get_value(message, "text")
    if isinstance(direct_text, str) and direct_text:
        return direct_text

    content = get_value(message, "content")
    if content is None:
        return ""

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        text_parts: List[str] = []
        for item in content:
            item_type = get_value(item, "type")
            if item_type not in (None, "text", "output_text"):
                continue
            text_value = get_value(item, "text") or get_value(item, "content")
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


def extract_message_tool_calls(
    message: Any,
    *,
    model: str,
    invalid_response_message: str,
) -> List[Dict[str, Any]]:
    """
    Normalize tool calls from OpenAI-style `message.tool_calls` or Anthropic-style
    `content` blocks (`type == tool_use`).
    """
    raw_tool_calls = get_value(message, "tool_calls")
    normalized_calls: List[Dict[str, Any]] = []

    if raw_tool_calls:
        normalized_calls.extend(
            normalize_raw_tool_calls(
                raw_tool_calls,
                model=model,
                invalid_response_message=invalid_response_message,
            )
        )

    content_blocks = get_value(message, "content")
    if isinstance(content_blocks, list):
        anthropic_blocks = [
            block for block in content_blocks if get_value(block, "type") == "tool_use"
        ]
        if anthropic_blocks:
            normalized_calls.extend(
                normalize_raw_tool_calls(
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


def normalize_raw_tool_calls(
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
        tool_id = get_value(raw_tool_call, "id")
        function_payload = get_value(raw_tool_call, "function")
        if function_payload is None and get_value(raw_tool_call, "type") == "tool_use":
            function_payload = raw_tool_call

        tool_name = (
            get_value(function_payload, "name")
            if function_payload is not None
            else get_value(raw_tool_call, "name")
        )
        raw_arguments = (
            get_value(function_payload, "arguments")
            if function_payload is not None
            else get_value(raw_tool_call, "arguments")
        )
        if raw_arguments is None:
            raw_arguments = get_value(raw_tool_call, "input")

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

        arguments = normalize_tool_arguments(
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


def normalize_tool_arguments(
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
