"""Rehydrate entry normalization helpers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from backend.src.agent.history.history_admission import (
    normalize_history_structured_content,
    normalize_history_text_content,
    should_store_assistant_history_message,
)
from backend.src.api.services.rehydrate_tool_call_normalization import (
    normalize_tool_calls,
)
from backend.src.api.services.rehydrate_tool_linkage import RehydrateToolLinkageState
from backend.src.api.services.rehydrate_transparency_resolution import (
    normalize_optional_string as normalize_optional_string_helper,
)
from backend.src.api.services.rehydrate_transparency_resolution import (
    resolve_rehydrated_content as resolve_rehydrated_content_helper,
)
from backend.src.core.types.enums import MessageType

_TOOL_OUTPUT_MESSAGE_TYPES = frozenset({MessageType.TOOL_OUTPUT.value})
_INTERNAL_BUNDLE_TOOL_NAMES = frozenset({"tool-bundle", "bundled-tools"})


def _extract_structured_tool_calls(
    structured_payload: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if not isinstance(structured_payload, dict):
        return []

    normalized_tool_calls = normalize_tool_calls(structured_payload.get("toolCalls"))
    if normalized_tool_calls:
        return normalized_tool_calls

    return []


class RehydrateEntryNormalizer:
    """Normalize one rehydrate transcript row into conversation-history entries."""

    def normalize_entry(
        self,
        *,
        entry: Any,
        index: int,
        image_data: Optional[Union[str, List[str]]],
        transparency: Optional[Dict[str, Any]],
        state: RehydrateToolLinkageState,
    ) -> List[Dict[str, Any]]:
        normalized_message_type = self.normalize_message_type(entry.message_type)
        stored_message_type = self.normalize_stored_message_type(
            role=entry.role,
            message_type=entry.message_type,
        )
        normalized_tool_name = normalize_optional_string_helper(entry.tool_name)
        correlation_id = normalize_optional_string_helper(entry.correlation_id)
        explicit_tool_call_id = normalize_optional_string_helper(entry.tool_call_id)
        message_tool_call_id = explicit_tool_call_id or correlation_id
        raw_structured_payload = getattr(entry, "structured_payload", None)
        structured_payload = (
            dict(raw_structured_payload)
            if isinstance(raw_structured_payload, dict)
            else None
        )
        raw_content = getattr(entry, "structured_content", None)
        if raw_content is None:
            raw_content = entry.content
        content = resolve_rehydrated_content_helper(
            role=entry.role,
            normalized_message_type=normalized_message_type,
            raw_content=raw_content,
            transparency=transparency,
        )

        if self.is_internal_bundle_trace(
            normalized_tool_name=normalized_tool_name,
        ):
            assistant_entry = self.build_assistant_context_entry(
                content=content,
                timestamp=entry.timestamp,
                image_data=image_data,
            )
            if assistant_entry is None:
                return []
            return [assistant_entry]

        if (
            entry.role == "tool"
            or normalized_message_type in _TOOL_OUTPUT_MESSAGE_TYPES
        ):
            call_id = message_tool_call_id
            if call_id is not None:
                state.consume_tool_output_tool_call_id(call_id)
            elif state.pending_tool_call_ids:
                call_id = state.consume_tool_output_tool_call_id()
            if call_id is None:
                raise ValueError(
                    "Cannot rehydrate tool output without a matching tool call "
                    f"at message index {index}"
                )

            entries: List[Dict[str, Any]] = []
            if call_id not in state.known_tool_call_ids:
                raise ValueError(
                    "Cannot rehydrate tool output for unknown tool call id "
                    f"{call_id!r} at message index {index}"
                )

            entries.append(
                {
                    "role": "tool",
                    "content": content,
                    "message_type": stored_message_type,
                    "tool_name": normalized_tool_name,
                    "correlation_id": correlation_id,
                    "timestamp": entry.timestamp,
                    "image_data": image_data,
                    "tool_call_id": call_id,
                }
            )
            return entries

        hydrated_entry: Dict[str, Any] = {
            "role": entry.role,
            "content": normalize_history_text_content(content),
            "message_type": stored_message_type,
            "tool_name": normalized_tool_name,
            "correlation_id": correlation_id,
            "timestamp": entry.timestamp,
            "image_data": image_data,
        }
        compaction_facts = getattr(entry, "compaction_facts", None)
        if isinstance(compaction_facts, dict) and compaction_facts:
            hydrated_entry["compaction_facts"] = dict(compaction_facts)
        structured_content = normalize_history_structured_content(
            content, role=entry.role
        )
        if structured_content is not None:
            hydrated_entry["structured_content"] = structured_content
        normalized_tool_calls = _extract_structured_tool_calls(structured_payload)
        if not normalized_tool_calls:
            normalized_tool_calls = normalize_tool_calls(entry.tool_calls)
        if entry.role == "assistant" and normalized_tool_calls:
            hydrated_entry["tool_calls"] = normalized_tool_calls
            state.register_tool_call_ids(
                [tool_call["id"] for tool_call in normalized_tool_calls]
            )
            return [hydrated_entry]

        if entry.role == "assistant" and not should_store_assistant_history_message(
            hydrated_entry["content"],
            tool_calls=normalized_tool_calls,
        ):
            return []

        return [hydrated_entry]

    @staticmethod
    def build_assistant_context_entry(
        *,
        content: Any,
        timestamp: Optional[str],
        image_data: Optional[Union[str, List[str]]],
    ) -> Optional[Dict[str, Any]]:
        normalized_content = normalize_history_text_content(content)
        if not normalized_content.strip() and image_data is None:
            return None
        return {
            "role": "assistant",
            "content": normalized_content,
            "structured_content": normalize_history_structured_content(
                content,
                role="assistant",
            ),
            "message_type": MessageType.ASSISTANT_RESPONSE.value,
            "tool_name": None,
            "correlation_id": None,
            "timestamp": timestamp,
            "image_data": image_data,
        }

    @staticmethod
    def normalize_message_type(message_type: Optional[str]) -> str:
        if not isinstance(message_type, str):
            return ""
        return message_type.strip().lower()

    @classmethod
    def normalize_stored_message_type(
        cls,
        *,
        role: Optional[str],
        message_type: Optional[str],
    ) -> Optional[str]:
        normalized = cls.normalize_message_type(message_type)
        if not normalized:
            normalized_role = role.strip().lower() if isinstance(role, str) else ""
            if normalized_role == "tool":
                return MessageType.TOOL_OUTPUT.value
            if normalized_role == "assistant":
                return MessageType.ASSISTANT_RESPONSE.value
            if normalized_role == "user":
                return MessageType.USER_QUERY.value
            return None
        if normalized in {message_type.value for message_type in MessageType}:
            return normalized
        raise ValueError(
            f"Rehydrate entry has unsupported message_type={message_type!r}; "
            "SDK rehydrate payloads must use canonical stored MessageType values."
        )

    @staticmethod
    def is_internal_bundle_trace(
        *,
        normalized_tool_name: Optional[str],
    ) -> bool:
        if isinstance(normalized_tool_name, str):
            normalized = normalized_tool_name.strip().lower().replace("_", "-")
            if normalized in _INTERNAL_BUNDLE_TOOL_NAMES:
                return True

        return False
