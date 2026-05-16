"""Shared message/tool normalization helpers for provider request payloads."""

from __future__ import annotations

import copy
import json
import logging
from typing import Any, Dict, List

from backend.src.core.infrastructure.error_types import LLMAPIError
from backend.src.core.messages.tool_call_thought_signature import (
    apply_tool_call_thought_signature,
    extract_tool_call_thought_signature,
)
from backend.src.core.types.schemas import LLMMessage
from backend.src.tools.tool_specs import (
    is_function_tool_spec,
    to_litellm_function_tool,
)

logger = logging.getLogger(__name__)


def _model_requires_thought_signature(model: str) -> bool:
    return "gemini" in model.lower()


def _apply_thought_signature(
    *,
    normalized_call: Dict[str, Any],
    thought_signature: str,
    model: str,
) -> bool:
    """Attach Gemini thought signature to OpenAI-format tool-call payload."""
    if not thought_signature or not _model_requires_thought_signature(model):
        return False

    return apply_tool_call_thought_signature(
        normalized_call=normalized_call,
        thought_signature=thought_signature,
    )


def normalize_messages_for_provider(
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
                normalize_assistant_message_tool_calls(
                    message,
                    index=index,
                    model=model,
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


def normalize_assistant_message_tool_calls(
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
        normalized_call, was_changed = normalize_assistant_tool_call_entry(
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


def normalize_assistant_tool_call_entry(
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
        if not isinstance(arguments, str):
            if arguments is not None and not isinstance(arguments, dict):
                raise LLMAPIError(
                    f"Invalid tool_calls[{call_index}] at assistant message index {message_index}: function.arguments must be string/object",
                    model=model,
                )
        normalized = copy.deepcopy(raw_call)
        changed = False
        if isinstance(arguments, dict):
            normalized["function"]["arguments"] = json.dumps(
                arguments, ensure_ascii=False, separators=(",", ":")
            )
            changed = True
        elif arguments is None:
            normalized["function"]["arguments"] = "{}"
            changed = True

        thought_signature = extract_tool_call_thought_signature(
            raw_call,
            raw_call.get("function"),
        )
        changed = _apply_thought_signature(
            normalized_call=normalized,
            thought_signature=thought_signature,
            model=model,
        ) or changed
        return normalized, changed

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
    normalized: Dict[str, Any] = {
        "id": call_id,
        "type": "function",
        "function": {
            "name": name,
            "arguments": json.dumps(arguments, ensure_ascii=False, separators=(",", ":")),
        },
    }
    thought_signature = extract_tool_call_thought_signature(
        raw_call,
        raw_call.get("function"),
    )
    _apply_thought_signature(
        normalized_call=normalized,
        thought_signature=thought_signature,
        model=model,
    )
    return normalized, True


def normalize_tools_for_litellm(
    tools: List[Dict[str, Any]],
    *,
    model: str,
) -> List[Dict[str, Any]]:
    """
    Validate canonical internal tool specs and convert them for LiteLLM transport.

    Runtime contract is strict: each entry must be
    `{type: "function", name, description?, strict?, parameters}`.
    """
    if not isinstance(tools, list):
        raise LLMAPIError(
            "Invalid tools payload: expected list of canonical tool objects",
            model=model,
        )

    normalized: List[Dict[str, Any]] = []
    for index, tool in enumerate(tools):
        normalized.append(
            normalize_single_tool_for_litellm(
                tool,
                index=index,
                model=model,
            )
        )
    return normalized


def normalize_single_tool_for_litellm(
    tool: Any,
    *,
    index: int,
    model: str,
) -> Dict[str, Any]:
    """Validate one canonical tool spec and convert it for LiteLLM."""
    if not isinstance(tool, dict):
        raise LLMAPIError(
            f"Invalid tool schema at index {index}: expected object",
            model=model,
        )

    if not is_function_tool_spec(tool):
        raise LLMAPIError(
            f"Invalid tool schema at index {index}: expected flat function tool spec",
            model=model,
        )
    try:
        return to_litellm_function_tool(tool)
    except ValueError as exc:
        raise LLMAPIError(
            f"Invalid tool schema at index {index}: {exc}",
            model=model,
        ) from exc
