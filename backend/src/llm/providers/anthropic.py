"""Provides the anthropic module for the backend."""

import copy
import logging
from typing import Any, Dict, List

from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.provider_native_reasoning import (
    apply_provider_native_thinking_request_params,
    extract_anthropic_thinking_content,
)
from backend.src.llm.providers.streaming_tool_call_aggregation import (
    StreamingToolCallAggregationMixin,
)

logger = logging.getLogger(__name__)

_PROMPT_CACHE_CONTROL = {"type": "ephemeral"}
_STATIC_USER_PROMPT_PREFIXES = (
    "# AGENTS.md instructions for ",
    "# Client prompt layer:",
)


def _has_cache_control(payload: Any) -> bool:
    if isinstance(payload, dict):
        if "cache_control" in payload:
            return True
        return _has_cache_control(payload.get("content"))
    if isinstance(payload, list):
        return any(_has_cache_control(item) for item in payload)
    return False


def _content_text_prefix(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str):
                return text
    return ""


def _is_static_prompt_context_message(message: Dict[str, Any]) -> bool:
    role = message.get("role")
    if role == "system":
        return True
    if role != "user":
        return False
    text_prefix = _content_text_prefix(message.get("content"))
    return text_prefix.startswith(_STATIC_USER_PROMPT_PREFIXES)


def _with_message_cache_control(message: Dict[str, Any]) -> Dict[str, Any]:
    if _has_cache_control(message):
        return message

    content = message.get("content")
    if isinstance(content, str):
        updated = dict(message)
        updated["cache_control"] = dict(_PROMPT_CACHE_CONTROL)
        return updated

    if isinstance(content, list):
        updated_content = copy.deepcopy(content)
        for item in reversed(updated_content):
            if (
                isinstance(item, dict)
                and item.get("type") in {"text", "input_text"}
                and isinstance(item.get("text"), str)
                and item.get("text")
            ):
                item["cache_control"] = dict(_PROMPT_CACHE_CONTROL)
                updated = dict(message)
                updated["content"] = updated_content
                return updated
    return message


def _with_static_prompt_cache_control(
    messages: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    for index in range(len(messages) - 1, -1, -1):
        message = messages[index]
        if not isinstance(message, dict):
            continue
        if not _is_static_prompt_context_message(message):
            continue
        updated_message = _with_message_cache_control(message)
        if updated_message is message:
            return messages
        updated_messages = list(messages)
        updated_messages[index] = updated_message
        return updated_messages
    return messages


def _with_tools_cache_control(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for index in range(len(tools) - 1, -1, -1):
        tool = tools[index]
        if not isinstance(tool, dict):
            continue
        function = tool.get("function")
        if tool.get("type") != "function" or not isinstance(function, dict):
            continue
        if _has_cache_control(tool) or _has_cache_control(function):
            return tools
        updated_tool = copy.deepcopy(tool)
        updated_tool["function"]["cache_control"] = dict(_PROMPT_CACHE_CONTROL)
        updated_tools = list(tools)
        updated_tools[index] = updated_tool
        return updated_tools
    return tools


def _apply_prompt_cache_controls(params: Dict[str, Any]) -> Dict[str, Any]:
    updated = params

    messages = params.get("messages")
    if isinstance(messages, list):
        cached_messages = _with_static_prompt_cache_control(messages)
        if cached_messages is not messages:
            updated = dict(updated)
            updated["messages"] = cached_messages

    tools = params.get("tools")
    if isinstance(tools, list) and tools:
        cached_tools = _with_tools_cache_control(tools)
        if cached_tools is not tools:
            updated = dict(updated)
            updated["tools"] = cached_tools

    return updated


class AnthropicProvider(StreamingToolCallAggregationMixin, OnlineLLMProvider):
    """Provider for Anthropic models."""

    provider_label = "Anthropic"
    model_prefix = "anthropic"
    stream_includes_thinking = True
    tool_turn_invalid_response_message = "Invalid response from Anthropic stream"
    tool_turn_parse_warning_prefix = (
        "Failed to parse streamed Anthropic tool-call arguments"
    )

    def _extract_thinking_content(self, delta: Any) -> str | None:
        return extract_anthropic_thinking_content(delta)

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
        runtime_model_id: str | None = None,
    ) -> Dict[str, Any]:
        apply_provider_native_thinking_request_params(
            params,
            model=model,
            provider_name="anthropic",
        )
        _ = runtime_model_id
        return _apply_prompt_cache_controls(params)

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Anthropic streams text/thinking while tool-use blocks are buffered until finalization.
        """
        _ = model
        return True
