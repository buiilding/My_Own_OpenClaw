"""Compatibility wrapper mixin for historical LLMProvider helper methods."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.message_normalization import (
    normalize_assistant_message_tool_calls,
    normalize_assistant_tool_call_entry,
    normalize_messages_for_provider,
    normalize_single_tool_for_litellm,
    normalize_tools_for_litellm,
)
from backend.src.llm.providers.response_parsing import (
    delta_contains_tool_calls,
    extract_completion_content,
    extract_completion_response,
    extract_delta_content,
    extract_message_content,
    extract_message_tool_calls,
    extract_stream_delta,
    extract_stream_finish_reason,
    extract_tagged_thinking_from_content,
    extract_thinking_content,
    first_item,
    get_value,
    normalize_raw_tool_calls,
    normalize_tool_arguments,
)


class ProviderPayloadCompatMixin:
    """
    Backward-compatible wrappers around extracted payload helper modules.

    Existing providers/tests call these methods on `LLMProvider`; moving them to a mixin
    keeps the class API stable while allowing `base.py` to stay focused on runtime flow.
    """

    @staticmethod
    def _normalize_messages_for_provider(
        messages: List[LLMMessage],
        *,
        model: str,
    ) -> List[LLMMessage]:
        return normalize_messages_for_provider(messages, model=model)

    @staticmethod
    def _normalize_assistant_message_tool_calls(
        message: Dict[str, Any],
        *,
        index: int,
        model: str,
    ) -> tuple[LLMMessage, bool, set[str]]:
        return normalize_assistant_message_tool_calls(
            message,
            index=index,
            model=model,
        )

    @staticmethod
    def _normalize_assistant_tool_call_entry(
        raw_call: Any,
        *,
        message_index: int,
        call_index: int,
        model: str,
    ) -> tuple[Dict[str, Any], bool]:
        return normalize_assistant_tool_call_entry(
            raw_call,
            message_index=message_index,
            call_index=call_index,
            model=model,
        )

    @staticmethod
    def _normalize_tools_for_litellm(
        tools: List[Dict[str, Any]],
        *,
        model: str,
    ) -> List[Dict[str, Any]]:
        return normalize_tools_for_litellm(tools, model=model)

    @staticmethod
    def _normalize_single_tool_for_litellm(
        tool: Any,
        *,
        index: int,
        model: str,
    ) -> Dict[str, Any]:
        return normalize_single_tool_for_litellm(
            tool,
            index=index,
            model=model,
        )

    @staticmethod
    def _first_item(values: Any) -> Optional[Any]:
        return first_item(values)

    def _extract_thinking_content(self, delta: Any) -> Optional[str]:
        return extract_thinking_content(delta)

    @staticmethod
    def _extract_stream_delta(chunk: Any) -> Optional[Any]:
        return extract_stream_delta(chunk)

    @staticmethod
    def _extract_stream_finish_reason(chunk: Any) -> Optional[str]:
        return extract_stream_finish_reason(chunk)

    @staticmethod
    def _extract_delta_content(delta: Any) -> Optional[str]:
        return extract_delta_content(delta)

    @staticmethod
    def _extract_completion_content(
        response: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> str:
        return extract_completion_content(
            response,
            model=model,
            invalid_response_message=invalid_response_message,
        )

    @staticmethod
    def _extract_completion_response(
        response: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> NormalizedLLMResponse:
        return extract_completion_response(
            response,
            model=model,
            invalid_response_message=invalid_response_message,
        )

    @staticmethod
    def _extract_message_content(message: Any) -> str:
        return extract_message_content(message)

    @staticmethod
    def _extract_message_tool_calls(
        message: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> List[Dict[str, Any]]:
        return extract_message_tool_calls(
            message,
            model=model,
            invalid_response_message=invalid_response_message,
        )

    @staticmethod
    def _normalize_raw_tool_calls(
        raw_tool_calls: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> List[Dict[str, Any]]:
        return normalize_raw_tool_calls(
            raw_tool_calls,
            model=model,
            invalid_response_message=invalid_response_message,
        )

    @staticmethod
    def _normalize_tool_arguments(
        raw_arguments: Any,
        *,
        model: str,
        invalid_response_message: str,
    ) -> Dict[str, Any]:
        return normalize_tool_arguments(
            raw_arguments,
            model=model,
            invalid_response_message=invalid_response_message,
        )

    @staticmethod
    def _get_value(source: Any, key: str) -> Any:
        return get_value(source, key)

    @staticmethod
    def _delta_contains_tool_calls(delta: Any) -> bool:
        return delta_contains_tool_calls(delta)

    @staticmethod
    def _extract_tagged_thinking_from_content(delta: Any) -> Optional[str]:
        return extract_tagged_thinking_from_content(delta)
