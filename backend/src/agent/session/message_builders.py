"""ConversationHistory message construction helpers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType


def normalize_message_type(
    role: Optional[Any],
    message_type: Optional[Any],
) -> MessageType:
    normalized = str(message_type or "").strip().lower().replace("-", "_")
    if normalized in {"tool", "tool_output", "tool_call"}:
        return MessageType.TOOL_OUTPUT
    if normalized in {"context_compaction", "compaction", "context_summary"}:
        return MessageType.CONTEXT_COMPACTION
    if normalized in {"assistant", "assistant_response", "llm_text", "error"}:
        return MessageType.ASSISTANT_RESPONSE
    if normalized in {"user", "user_query", "query"}:
        return MessageType.USER_QUERY

    normalized_role = str(role or "").strip().lower()
    if normalized_role == "assistant":
        return MessageType.ASSISTANT_RESPONSE
    if normalized_role == "tool":
        return MessageType.TOOL_OUTPUT
    return MessageType.USER_QUERY


def build_user_message(
    *,
    content: str,
    image_data: Optional[Union[str, List[str]]],
    episodic_memory: Optional[List[str]],
    semantic_memory: Optional[List[str]],
    user_query_raw: Optional[str],
) -> StoredMessage:
    return StoredMessage(
        role=MessageRole.USER,
        content=content,
        message_type=MessageType.USER_QUERY,
        image_data=image_data,
        episodic_memory=episodic_memory,
        semantic_memory=semantic_memory,
        user_query_raw=user_query_raw,
    )


def build_tool_output_message(
    message: str,
    image_data: Optional[Union[str, List[str]]],
) -> StoredMessage:
    return StoredMessage(
        role=MessageRole.USER,
        content=message,
        message_type=MessageType.TOOL_OUTPUT,
        image_data=image_data,
    )


def build_tool_result_message(
    *,
    message: str,
    tool_call_id: str,
    image_data: Optional[Union[str, List[str]]] = None,
) -> StoredMessage:
    return StoredMessage(
        role=MessageRole.TOOL,
        content=message,
        message_type=MessageType.TOOL_OUTPUT,
        image_data=image_data,
        tool_call_id=tool_call_id,
    )


def build_assistant_message(
    *,
    message: str,
    tool_calls: Optional[List[Dict[str, Any]]] = None,
) -> StoredMessage:
    return StoredMessage(
        role=MessageRole.ASSISTANT,
        content=message,
        message_type=MessageType.ASSISTANT_RESPONSE,
        image_data=None,
        tool_calls=tool_calls,
    )
