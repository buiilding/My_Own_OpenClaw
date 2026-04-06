"""ConversationHistory message construction helpers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.core.types.schemas import MultimodalContent


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


def _build_structured_multimodal_content(
    *,
    text: str,
    image_data: Optional[Union[str, List[str]]],
) -> Optional[MultimodalContent]:
    """Build structured multimodal content when image payloads are present."""
    normalized_image_data = StoredMessage._normalized_image_data(image_data)
    if not normalized_image_data:
        return None
    return StoredMessage._build_multimodal_content(text, normalized_image_data)


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
        structured_content=_build_structured_multimodal_content(
            text=content,
            image_data=image_data,
        ),
        image_data=image_data,
        episodic_memory=episodic_memory,
        semantic_memory=semantic_memory,
        user_query_raw=user_query_raw,
    )


def build_tool_output_message(
    message: str,
    image_data: Optional[Union[str, List[str]]],
    *,
    tool_name: Optional[str] = None,
    compaction_facts: Optional[Dict[str, Any]] = None,
) -> StoredMessage:
    return StoredMessage(
        role=MessageRole.USER,
        content=message,
        message_type=MessageType.TOOL_OUTPUT,
        structured_content=_build_structured_multimodal_content(
            text=message,
            image_data=image_data,
        ),
        image_data=image_data,
        tool_name=tool_name,
        compaction_facts=compaction_facts,
    )


def build_tool_result_message(
    *,
    message: str,
    tool_call_id: str,
    image_data: Optional[Union[str, List[str]]] = None,
    tool_name: Optional[str] = None,
    compaction_facts: Optional[Dict[str, Any]] = None,
) -> StoredMessage:
    return StoredMessage(
        role=MessageRole.TOOL,
        content=message,
        message_type=MessageType.TOOL_OUTPUT,
        structured_content=_build_structured_multimodal_content(
            text=message,
            image_data=image_data,
        ),
        image_data=image_data,
        tool_call_id=tool_call_id,
        tool_name=tool_name,
        compaction_facts=compaction_facts,
    )


def build_assistant_message(
    *,
    message: str,
    structured_content: Optional[MultimodalContent] = None,
    tool_calls: Optional[List[Dict[str, Any]]] = None,
) -> StoredMessage:
    return StoredMessage(
        role=MessageRole.ASSISTANT,
        content=message,
        message_type=MessageType.ASSISTANT_RESPONSE,
        structured_content=structured_content,
        image_data=None,
        tool_calls=tool_calls,
    )
