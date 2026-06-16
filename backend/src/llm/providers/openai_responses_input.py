"""Input-shaping helpers for the OpenAI Responses API runtime."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from backend.src.core.messages.content_blocks import (
    TEXT_CONTENT_PART_TYPES,
    extract_text_from_content_part,
    normalize_content_part_type,
)
from backend.src.core.types.schemas import LLMMessage
from backend.src.llm.models.models_config import (
    resolve_model_preset,
    resolve_runtime_model_id,
)
from backend.src.llm.providers.openai_tool_prep import (
    build_openai_responses_tools as build_openai_transport_responses_tools,
)
from backend.src.llm.providers.response_parsing import get_value
from backend.src.tools.tool_specs import to_litellm_tool_choice


OPENAI_IMAGE_DETAIL = "original"


def _normalize_text_block(
    item: Any,
    *,
    output_type: str,
) -> Optional[Dict[str, Any]]:
    text = extract_text_from_content_part(item, include_refusal=False)
    if text:
        return {"type": output_type, "text": text}
    return None


def _normalize_refusal_block(item: Any) -> Optional[Dict[str, Any]]:
    refusal = extract_text_from_content_part(item, include_refusal=True)
    if refusal:
        return {"type": "refusal", "refusal": refusal}
    return None


def _normalize_image_block(item: Any) -> Optional[Dict[str, Any]]:
    image_url = get_value(item, "image_url")
    if isinstance(image_url, dict):
        url = image_url.get("url")
    else:
        url = image_url or get_value(item, "url")
    if isinstance(url, str) and url:
        return {
            "type": "input_image",
            "image_url": url,
            "detail": OPENAI_IMAGE_DETAIL,
        }
    return None


def _normalize_message_content_for_input(content: Any) -> Any:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content) if content is not None else ""

    normalized: List[Dict[str, Any]] = []
    for item in content:
        item_type = normalize_content_part_type(get_value(item, "type"))
        if item_type in TEXT_CONTENT_PART_TYPES:
            normalized_block = _normalize_text_block(item, output_type="input_text")
            if normalized_block is not None:
                normalized.append(normalized_block)
        elif item_type in {"image_url", "input_image"}:
            normalized_block = _normalize_image_block(item)
            if normalized_block is not None:
                normalized.append(normalized_block)
    return normalized or ""


def _normalize_assistant_message_content(content: Any) -> Any:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content) if content is not None else ""

    normalized: List[Dict[str, Any]] = []
    for item in content:
        item_type = normalize_content_part_type(get_value(item, "type"))
        if item_type in {"text", "output_text"}:
            normalized_block = _normalize_text_block(item, output_type="output_text")
            if normalized_block is not None:
                normalized.append(normalized_block)
        elif item_type == "refusal":
            normalized_block = _normalize_refusal_block(item)
            if normalized_block is not None:
                normalized.append(normalized_block)
    return normalized or ""


def _validate_message_item_content(
    *,
    role: str,
    content: Any,
) -> None:
    if isinstance(content, str):
        return
    if not isinstance(content, list):
        raise ValueError(
            f"OpenAI Responses {role} history content must be string or list"
        )
    if not content:
        raise ValueError(f"OpenAI Responses {role} history content must not be empty")

    if role == "assistant":
        allowed_types = {"output_text", "refusal"}
    else:
        allowed_types = {"input_text", "input_image"}

    for item in content:
        if not isinstance(item, dict):
            raise ValueError(
                f"OpenAI Responses {role} history content block must be object"
            )
        item_type = str(item.get("type") or "").strip()
        if item_type not in allowed_types:
            raise ValueError(
                f"OpenAI Responses {role} history content type '{item_type}' is not supported"
            )


def _validate_openai_responses_input_items(input_items: List[Dict[str, Any]]) -> None:
    for item in input_items:
        item_type = str(item.get("type") or "").strip()
        if item_type == "message":
            role = str(item.get("role") or "").strip()
            if role not in {"system", "user", "assistant"}:
                raise ValueError(
                    f"OpenAI Responses message role '{role}' is not supported"
                )
            _validate_message_item_content(
                role=role,
                content=item.get("content"),
            )
            continue

        if item_type in {
            "function_call",
            "function_call_output",
        }:
            call_id = str(item.get("call_id") or "").strip()
            if not call_id:
                raise ValueError(
                    f"OpenAI Responses item '{item_type}' is missing required call_id"
                )


def _normalize_assistant_tool_call_input(tool_call: Dict[str, Any]) -> Dict[str, Any]:
    function_payload = tool_call.get("function")
    if not isinstance(function_payload, dict):
        raise ValueError(
            "OpenAI Responses input requires provider-normalized assistant "
            "tool_calls with function payloads"
        )

    name = function_payload.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(
            "OpenAI Responses assistant tool_call function.name must be non-empty string"
        )
    arguments = function_payload.get("arguments")
    if not isinstance(arguments, str):
        raise ValueError(
            "OpenAI Responses assistant tool_call function.arguments must be string"
        )

    return {
        "type": "function_call",
        "call_id": str(tool_call.get("id") or ""),
        "name": name,
        "arguments": arguments,
        "status": "completed",
    }


def _normalize_tool_output_content(content: Any) -> Any:
    normalized = _normalize_message_content_for_input(content)
    if normalized == "":
        return ""
    return normalized


def _build_openai_responses_continuation_input(
    messages: List[LLMMessage],
) -> List[Dict[str, Any]]:
    continuation_messages: list[LLMMessage] = []
    for message in reversed(messages):
        if str(message.get("role") or "").strip() != "tool":
            break
        continuation_messages.append(message)
    continuation_messages.reverse()

    input_items: List[Dict[str, Any]] = []
    for message in continuation_messages:
        tool_call_id = message.get("tool_call_id")
        if not isinstance(tool_call_id, str) or not tool_call_id.strip():
            continue
        input_items.append(
            {
                "type": "function_call_output",
                "call_id": tool_call_id.strip(),
                "output": _normalize_tool_output_content(message.get("content")),
                "status": "completed",
            }
        )
    return input_items


def build_openai_responses_input(
    messages: List[LLMMessage],
    *,
    previous_response_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Convert WindieOS chat history to OpenAI Responses input items."""
    if isinstance(previous_response_id, str) and previous_response_id.strip():
        continuation_items = _build_openai_responses_continuation_input(messages)
        if continuation_items:
            _validate_openai_responses_input_items(continuation_items)
            return continuation_items

    input_items: List[Dict[str, Any]] = []
    for message in messages:
        role = str(message.get("role") or "").strip()
        if role in {"system", "user"}:
            input_items.append(
                {
                    "type": "message",
                    "role": role,
                    "content": _normalize_message_content_for_input(
                        message.get("content")
                    ),
                }
            )
            continue

        if role == "assistant":
            content = message.get("content")
            normalized_content = _normalize_assistant_message_content(content)
            if normalized_content not in (None, "", []):
                input_items.append(
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": normalized_content,
                    }
                )
            for tool_call in message.get("tool_calls") or []:
                if isinstance(tool_call, dict):
                    input_items.append(_normalize_assistant_tool_call_input(tool_call))
            continue

        if role == "tool":
            tool_call_id = message.get("tool_call_id")
            if not isinstance(tool_call_id, str) or not tool_call_id.strip():
                continue
            input_items.append(
                {
                    "type": "function_call_output",
                    "call_id": tool_call_id.strip(),
                    "output": _normalize_tool_output_content(message.get("content")),
                    "status": "completed",
                }
            )
    _validate_openai_responses_input_items(input_items)
    return input_items


def build_openai_responses_tools(
    tools: Optional[List[Dict[str, Any]]],
    *,
    native_web_search_enabled: bool = False,
) -> Optional[List[Dict[str, Any]]]:
    return build_openai_transport_responses_tools(
        tools,
        native_web_search_enabled=native_web_search_enabled,
    )


def build_openai_responses_tool_choice(tool_choice: Any) -> Any:
    choice = to_litellm_tool_choice(tool_choice)
    if isinstance(choice, dict):
        function = choice.get("function")
        if isinstance(function, dict) and isinstance(function.get("name"), str):
            return {"type": "function", "name": function["name"]}
    return choice


def build_openai_reasoning_config(model_id: str) -> Dict[str, str]:
    preset = resolve_model_preset(model_id)
    explicit_mode = str((preset or {}).get("reasoning_mode") or "").strip().lower()
    if explicit_mode in {"none", "minimal", "low", "medium", "high", "xhigh"}:
        return {"effort": explicit_mode, "summary": "detailed"}
    raise ValueError(
        "OpenAI Responses reasoning config requires explicit reasoning_mode metadata "
        f"for model '{model_id}'."
    )


def build_openai_responses_params(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = None,
    parallel_tool_calls: Optional[bool] = None,
    max_output_tokens: Optional[int] = None,
    include_reasoning: bool = True,
    native_web_search_enabled: bool = False,
    previous_response_id: Optional[str] = None,
) -> Dict[str, Any]:
    runtime_model_id = resolve_runtime_model_id(model)
    normalized_messages = provider._normalize_messages_for_provider(
        messages,
        model=runtime_model_id,
    )
    params: Dict[str, Any] = {
        "model": provider._get_full_model_string(runtime_model_id),
        "input": build_openai_responses_input(
            normalized_messages,
            previous_response_id=previous_response_id,
        ),
        "api_key": provider.api_key,
        "base_url": provider.base_url,
        "timeout": provider.timeout,
    }
    if isinstance(previous_response_id, str) and previous_response_id.strip():
        params["previous_response_id"] = previous_response_id.strip()
    if tools is not None:
        params["tools"] = build_openai_responses_tools(
            tools,
            native_web_search_enabled=native_web_search_enabled,
        )
    elif native_web_search_enabled:
        params["tools"] = build_openai_responses_tools(
            None,
            native_web_search_enabled=True,
        )
    if tool_choice is not None:
        params["tool_choice"] = build_openai_responses_tool_choice(tool_choice)
    if parallel_tool_calls is not None:
        params["parallel_tool_calls"] = parallel_tool_calls
    if isinstance(max_output_tokens, int) and max_output_tokens > 0:
        params["max_output_tokens"] = max_output_tokens
    if include_reasoning:
        params["reasoning"] = build_openai_reasoning_config(model)
    if native_web_search_enabled:
        params["include"] = ["web_search_call.action.sources"]
    return params
