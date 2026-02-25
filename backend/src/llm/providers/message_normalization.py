"""Shared message/tool normalization helpers for provider request payloads."""

from __future__ import annotations

import copy
import json
import logging
from typing import Any, Dict, List

from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.core.types.schemas import LLMMessage

logger = logging.getLogger(__name__)


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
                "arguments": json.dumps(arguments, ensure_ascii=False, separators=(",", ":")),
            },
        },
        True,
    )


def normalize_tools_for_litellm(
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
