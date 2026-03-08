"""OpenAI Responses API runtime for provider-native reasoning support."""

from __future__ import annotations

import copy
import json
from typing import Any, AsyncGenerator, Dict, Iterable, List, Optional

import litellm

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent, ThinkingEvent
from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.models.models_config import resolve_model_preset, resolve_runtime_model_id
from backend.src.llm.providers.response_parsing import get_value

_INVALID_OPENAI_RESPONSE = "Invalid response from OpenAI"
_FUNCTION_CALL_ARGUMENTS_PREVIEW_CHARS = 4000


def _normalize_message_content_for_input(content: Any) -> Any:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content) if content is not None else ""

    normalized: List[Dict[str, Any]] = []
    for item in content:
        item_type = get_value(item, "type")
        if item_type == "text":
            text = get_value(item, "text")
            if isinstance(text, str):
                normalized.append({"type": "input_text", "text": text})
        elif item_type == "image_url":
            image_url = get_value(item, "image_url")
            if isinstance(image_url, dict):
                url = image_url.get("url")
            else:
                url = get_value(image_url, "url")
            if isinstance(url, str) and url:
                normalized.append({"type": "input_image", "image_url": url})
    return normalized or ""


def _normalize_assistant_tool_call_input(
    tool_call: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "type": "function_call",
        "call_id": str(tool_call.get("id") or ""),
        "name": str(tool_call.get("name") or ""),
        "arguments": json.dumps(tool_call.get("arguments") or {}, ensure_ascii=False),
        "status": "completed",
    }


def _normalize_tool_output_content(content: Any) -> Any:
    normalized = _normalize_message_content_for_input(content)
    if normalized == "":
        return ""
    return normalized


def build_openai_responses_input(messages: List[LLMMessage]) -> List[Dict[str, Any]]:
    """Convert WindieOS chat history to OpenAI Responses input items."""
    input_items: List[Dict[str, Any]] = []
    for message in messages:
        role = str(message.get("role") or "").strip()
        if role in {"system", "user"}:
            input_items.append(
                {
                    "type": "message",
                    "role": role,
                    "content": _normalize_message_content_for_input(message.get("content")),
                }
            )
            continue

        if role == "assistant":
            content = message.get("content")
            if content not in (None, "", []):
                input_items.append(
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": _normalize_message_content_for_input(content),
                    }
                )
            for tool_call in message.get("tool_calls") or []:
                if not isinstance(tool_call, dict):
                    continue
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
    return input_items


def build_openai_responses_tools(tools: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
    if tools is None:
        return None
    normalized: List[Dict[str, Any]] = []
    for tool in tools:
        if not isinstance(tool, dict):
            continue
        if tool.get("type") != "function":
            continue
        function = tool.get("function")
        if not isinstance(function, dict):
            continue
        normalized.append(
            {
                "type": "function",
                "name": function.get("name"),
                "description": function.get("description"),
                "parameters": copy.deepcopy(function.get("parameters")),
                "strict": False,
            }
        )
    return normalized


def build_openai_responses_tool_choice(tool_choice: Any) -> Any:
    if tool_choice is None or isinstance(tool_choice, str):
        return tool_choice

    if isinstance(tool_choice, dict):
        choice_type = tool_choice.get("type")
        if choice_type == "function":
            function = tool_choice.get("function")
            if isinstance(function, dict) and isinstance(function.get("name"), str):
                return {"type": "function", "name": function["name"]}
        if choice_type in {"none", "auto", "required"}:
            return choice_type
    return tool_choice


def build_openai_reasoning_config(model_id: str) -> Dict[str, str]:
    preset = resolve_model_preset(model_id)
    display_name = str((preset or {}).get("display_name") or model_id).lower()
    effort = "medium"
    if "extra high" in display_name or "xhigh" in display_name:
        effort = "xhigh"
    elif "high" in display_name:
        effort = "high"
    elif "low" in display_name or "mini" in display_name:
        effort = "low"
    elif "minimal" in display_name:
        effort = "minimal"
    elif "none" in display_name:
        effort = "none"
    return {"effort": effort, "summary": "detailed"}


def build_openai_responses_params(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = None,
    parallel_tool_calls: Optional[bool] = None,
    include_reasoning: bool = True,
) -> Dict[str, Any]:
    runtime_model_id = resolve_runtime_model_id(model)
    normalized_messages = provider._normalize_messages_for_provider(messages, model=runtime_model_id)
    normalized_tools = provider._normalize_tools_for_litellm(tools, model=runtime_model_id) if tools is not None else None
    params: Dict[str, Any] = {
        "model": provider._get_full_model_string(runtime_model_id),
        "input": build_openai_responses_input(normalized_messages),
        "api_key": provider.api_key,
        "base_url": provider.base_url,
        "timeout": provider.timeout,
    }
    if normalized_tools is not None:
        params["tools"] = build_openai_responses_tools(normalized_tools)
    if tool_choice is not None:
        params["tool_choice"] = build_openai_responses_tool_choice(tool_choice)
    if parallel_tool_calls is not None:
        params["parallel_tool_calls"] = parallel_tool_calls
    if include_reasoning:
        params["reasoning"] = build_openai_reasoning_config(model)
    return params


def _preview_function_arguments(raw_arguments: str) -> str:
    payload = (raw_arguments or "").strip()
    if len(payload) <= _FUNCTION_CALL_ARGUMENTS_PREVIEW_CHARS:
        return payload
    return f"{payload[:_FUNCTION_CALL_ARGUMENTS_PREVIEW_CHARS]}...[truncated]"


def _normalize_tool_call_arguments(provider: Any, raw_arguments: Any, *, model: str) -> Dict[str, Any]:
    return provider._normalize_tool_arguments(
        raw_arguments,
        model=model,
        invalid_response_message=_INVALID_OPENAI_RESPONSE,
    )


def _iter_response_output_items(response: Any) -> Iterable[Any]:
    output = get_value(response, "output")
    if isinstance(output, list):
        for item in output:
            yield item


def normalize_openai_responses_payload(
    provider: Any,
    response: Any,
    *,
    model: str,
) -> NormalizedLLMResponse:
    top_level_text = get_value(response, "output_text")
    message_text_parts: List[str] = []
    tool_calls: List[Dict[str, Any]] = []

    for item in _iter_response_output_items(response):
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

        if item_type != "function_call":
            continue

        raw_arguments = get_value(item, "arguments")
        try:
            arguments = _normalize_tool_call_arguments(provider, raw_arguments, model=model)
        except LLMAPIError as exc:
            preview = _preview_function_arguments(str(raw_arguments or ""))
            raise LLMAPIError(
                (
                    f"{_INVALID_OPENAI_RESPONSE}: failed to parse Responses API tool-call arguments "
                    f"for name={get_value(item, 'name')!r}. Raw arguments preview: {preview!r}"
                ),
                model=model,
            ) from exc

        tool_calls.append(
            {
                "id": str(get_value(item, "call_id") or get_value(item, "id") or f"tool_call_{len(tool_calls)}"),
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
    finish_reason = get_value(response, "status")
    if isinstance(finish_reason, str):
        normalized["finish_reason"] = finish_reason
    return normalized


async def get_openai_responses_completion(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = None,
    parallel_tool_calls: Optional[bool] = None,
) -> NormalizedLLMResponse:
    params = build_openai_responses_params(
        provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
        include_reasoning=True,
    )
    response = await litellm.aresponses(**params)
    provider._record_usage_from_payload_container(response)
    return normalize_openai_responses_payload(provider, response, model=model)


async def stream_openai_responses_events(
    provider: Any,
    *,
    model: str,
    messages: List[LLMMessage],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = None,
    parallel_tool_calls: Optional[bool] = None,
) -> AsyncGenerator[StreamingEvent, None]:
    params = build_openai_responses_params(
        provider,
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        parallel_tool_calls=parallel_tool_calls,
        include_reasoning=True,
    )
    params["stream"] = True

    stream = await litellm.aresponses(**params)
    final_response_payload: Optional[NormalizedLLMResponse] = None

    async for event in stream:
        event_type = str(get_value(event, "type") or "")
        if event_type in {
            "response.reasoning_summary_text.delta",
            "response.reasoning_text.delta",
        }:
            delta = get_value(event, "delta")
            if isinstance(delta, str) and delta:
                yield ThinkingEvent(content=delta)
            continue

        if event_type == "response.output_text.delta":
            delta = get_value(event, "delta")
            if isinstance(delta, str) and delta:
                yield ChunkEvent(content=delta)
            continue

        if event_type == "response.completed":
            response = get_value(event, "response")
            if response is not None:
                provider._record_usage_from_payload_container(response)
                final_response_payload = normalize_openai_responses_payload(
                    provider,
                    response,
                    model=model,
                )
                provider._set_last_stream_response_payload(final_response_payload)

    if final_response_payload is None:
        raise LLMAPIError(
            f"{_INVALID_OPENAI_RESPONSE}: stream completed without a final response payload",
            model=model,
        )
