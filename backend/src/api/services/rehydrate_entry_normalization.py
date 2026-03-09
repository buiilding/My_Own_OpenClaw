"""Rehydrate entry normalization helpers."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from backend.src.api.services.rehydrate_tool_linkage_repair import (
    RehydrateToolLinkageState,
)
from backend.src.api.services.rehydrate_tool_call_normalization import (
    extract_thought_signature as extract_thought_signature_helper,
    extract_tool_call_details as extract_tool_call_details_helper,
    normalize_tool_calls as normalize_tool_calls_helper,
)
from backend.src.api.services.rehydrate_transparency_resolution import (
    extract_system_prompt_from_transparency as extract_system_prompt_from_transparency_helper,
    normalize_optional_string as normalize_optional_string_helper,
    normalize_transparency as normalize_transparency_helper,
    resolve_rehydrated_content as resolve_rehydrated_content_helper,
    resolve_transparency_content as resolve_transparency_content_helper,
)

_TOOL_CALL_MESSAGE_TYPES = frozenset({"tool-call", "tool_call", "tool-bundle", "tool_bundle"})
_TOOL_OUTPUT_MESSAGE_TYPES = frozenset({"tool-output", "tool_output", "tool-result", "tool_result"})
_INTERNAL_BUNDLE_MESSAGE_TYPES = frozenset({"tool-bundle", "tool_bundle"})
_INTERNAL_BUNDLE_TOOL_NAMES = frozenset({"tool-bundle", "tool_bundle", "bundled_tools", "bundled-tools"})


@dataclass(slots=True)
class RehydrateNormalizationState:
    """Mutable state while replaying transcript rows."""

    known_tool_call_ids: set[str] = field(default_factory=set)
    pending_tool_call_ids: List[str] = field(default_factory=list)
    tool_linkage: RehydrateToolLinkageState = field(init=False)

    def __post_init__(self) -> None:
        self.tool_linkage = RehydrateToolLinkageState(
            known_tool_call_ids=self.known_tool_call_ids,
            pending_tool_call_ids=list(self.pending_tool_call_ids),
        )

    @property
    def known_tool_call_ids_view(self) -> set[str]:
        return self.tool_linkage.known_tool_call_ids

    @property
    def pending_tool_call_id(self) -> Optional[str]:
        return self.tool_linkage.pending_tool_call_id

    @pending_tool_call_id.setter
    def pending_tool_call_id(self, value: Optional[str]) -> None:
        self.tool_linkage.pending_tool_call_id = value
        self.pending_tool_call_ids = self.tool_linkage.pending_tool_call_ids

    @property
    def pending_tool_call_ids_view(self) -> List[str]:
        return self.tool_linkage.pending_tool_call_ids

    def add_pending_tool_call_ids(self, tool_call_ids: List[str]) -> None:
        self.tool_linkage.register_tool_call_ids(tool_call_ids)
        self.known_tool_call_ids = self.tool_linkage.known_tool_call_ids
        self.pending_tool_call_ids = self.tool_linkage.pending_tool_call_ids

    def consume_pending_tool_call_id(
        self,
        preferred_tool_call_id: Optional[str] = None,
    ) -> Optional[str]:
        tool_call_id = self.tool_linkage.consume_tool_output_tool_call_id(
            preferred_tool_call_id
        )
        self.known_tool_call_ids = self.tool_linkage.known_tool_call_ids
        self.pending_tool_call_ids = self.tool_linkage.pending_tool_call_ids
        return tool_call_id


class RehydrateEntryNormalizer:
    """Normalize one rehydrate transcript row into conversation-history entries."""

    @staticmethod
    def normalize_transparency(
        transparency: Any,
    ) -> Optional[Dict[str, Any]]:
        return normalize_transparency_helper(transparency)

    def extract_system_prompt_from_transparency(
        self,
        transparency: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        _ = self
        return extract_system_prompt_from_transparency_helper(transparency)

    def normalize_entry(
        self,
        *,
        entry: Any,
        index: int,
        image_data: Optional[str],
        transparency: Optional[Dict[str, Any]],
        state: RehydrateNormalizationState,
    ) -> tuple[List[Dict[str, Any]], Optional[str]]:
        normalized_message_type = self.normalize_message_type(entry.message_type)
        stored_message_type = self.normalize_stored_message_type(entry.message_type)
        normalized_tool_name = self.normalize_optional_string(entry.tool_name)
        correlation_id = self.normalize_optional_string(entry.correlation_id)
        explicit_tool_call_id = self.normalize_optional_string(entry.tool_call_id)
        message_tool_call_id = explicit_tool_call_id or correlation_id
        content = self.resolve_rehydrated_content(
            role=entry.role,
            normalized_message_type=normalized_message_type,
            raw_content=entry.content,
            transparency=transparency,
        )

        if self.is_internal_bundle_trace(
            normalized_message_type=normalized_message_type,
            normalized_tool_name=normalized_tool_name,
            content=content,
        ):
            assistant_entry = self.build_assistant_context_entry(
                content=content,
                timestamp=entry.timestamp,
                image_data=image_data,
            )
            if assistant_entry is None:
                return [], None
            return [assistant_entry], None

        if normalized_message_type in _TOOL_CALL_MESSAGE_TYPES:
            call_name, call_arguments, parsed_call_id, thought_signature = self.extract_tool_call_details(
                content=content,
                fallback_tool_name=normalized_tool_name,
            )
            call_id = message_tool_call_id or parsed_call_id or f"rehydrate_tool_call_{index}"
            state.add_pending_tool_call_ids([call_id])
            return (
                [
                    self.build_assistant_tool_call_entry(
                        content=content,
                        call_id=call_id,
                        call_name=call_name,
                        call_arguments=call_arguments,
                        thought_signature=thought_signature,
                        message_type=stored_message_type,
                        timestamp=entry.timestamp,
                        image_data=image_data,
                    )
                ],
                call_id,
            )

        if entry.role == "tool" or normalized_message_type in _TOOL_OUTPUT_MESSAGE_TYPES:
            call_id = message_tool_call_id
            consumed_pending_tool_call_id: Optional[str] = None
            if call_id is not None:
                consumed_pending_tool_call_id = state.consume_pending_tool_call_id(call_id)
            elif state.pending_tool_call_ids:
                consumed_pending_tool_call_id = state.consume_pending_tool_call_id()
                call_id = consumed_pending_tool_call_id
            if call_id is None:
                call_id = f"rehydrate_tool_call_{index}"

            entries: List[Dict[str, Any]] = []
            if call_id not in state.known_tool_call_ids:
                call_name, call_arguments, _, thought_signature = self.extract_tool_call_details(
                    content=content,
                    fallback_tool_name=normalized_tool_name,
                )
                entries.append(
                    self.build_assistant_tool_call_entry(
                        content="",
                        call_id=call_id,
                        call_name=call_name,
                        call_arguments=call_arguments,
                        thought_signature=thought_signature,
                        message_type="tool-call",
                        timestamp=entry.timestamp,
                        image_data=None,
                    )
                )
                state.tool_linkage.known_tool_call_ids.add(call_id)
                state.known_tool_call_ids = state.tool_linkage.known_tool_call_ids

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
            return entries, None

        hydrated_entry: Dict[str, Any] = {
            "role": entry.role,
            "content": content,
            "message_type": stored_message_type,
            "tool_name": normalized_tool_name,
            "correlation_id": correlation_id,
            "timestamp": entry.timestamp,
            "image_data": image_data,
        }
        normalized_tool_calls = self.normalize_tool_calls(entry.tool_calls)
        if entry.role == "assistant" and normalized_tool_calls:
            hydrated_entry["tool_calls"] = normalized_tool_calls
            state.add_pending_tool_call_ids(
                [tool_call["id"] for tool_call in normalized_tool_calls]
            )
            return [hydrated_entry], normalized_tool_calls[-1]["id"]

        return [hydrated_entry], None

    @staticmethod
    def finalize_pending_tool_call_entries(
        *,
        state: RehydrateNormalizationState,
        timestamp: Optional[str],
    ) -> List[Dict[str, Any]]:
        repaired_entries = state.tool_linkage.build_missing_tool_output_entries(
            timestamp=timestamp
        )
        state.pending_tool_call_ids = state.tool_linkage.pending_tool_call_ids
        return repaired_entries

    @staticmethod
    def build_assistant_context_entry(
        *,
        content: Any,
        timestamp: Optional[str],
        image_data: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        normalized_content = content if isinstance(content, str) else ""
        if not normalized_content.strip() and image_data is None:
            return None
        return {
            "role": "assistant",
            "content": normalized_content,
            "message_type": "llm-text",
            "tool_name": None,
            "correlation_id": None,
            "timestamp": timestamp,
            "image_data": image_data,
        }

    @staticmethod
    def normalize_message_type(message_type: Optional[str]) -> str:
        if not isinstance(message_type, str):
            return ""
        return message_type.strip().lower().replace("_", "-")

    @classmethod
    def normalize_stored_message_type(cls, message_type: Optional[str]) -> Optional[str]:
        normalized = cls.normalize_message_type(message_type)
        if normalized in {"context-compaction", "context-summary"}:
            return "context-compaction"
        return message_type

    @staticmethod
    def normalize_optional_string(value: Optional[str]) -> Optional[str]:
        return normalize_optional_string_helper(value)

    def extract_tool_call_details(
        self,
        *,
        content: str,
        fallback_tool_name: Optional[str],
    ) -> tuple[str, Dict[str, Any], Optional[str], Optional[str]]:
        return extract_tool_call_details_helper(
            content=content,
            fallback_tool_name=fallback_tool_name,
        )

    @classmethod
    def is_internal_bundle_trace(
        cls,
        *,
        normalized_message_type: str,
        normalized_tool_name: Optional[str],
        content: Any,
    ) -> bool:
        if normalized_message_type in _INTERNAL_BUNDLE_MESSAGE_TYPES:
            return True

        if isinstance(normalized_tool_name, str):
            normalized = normalized_tool_name.strip().lower().replace("_", "-")
            if normalized in _INTERNAL_BUNDLE_TOOL_NAMES:
                return True

        if not isinstance(content, str) or not content.strip():
            return False
        try:
            payload = json.loads(content)
        except (TypeError, ValueError):
            return False
        return (
            isinstance(payload, dict)
            and isinstance(payload.get("bundle_id"), str)
            and isinstance(payload.get("tools"), list)
        )

    @staticmethod
    def extract_thought_signature(*sources: Optional[Dict[str, Any]]) -> Optional[str]:
        return extract_thought_signature_helper(*sources)

    def resolve_rehydrated_content(
        self,
        *,
        role: Any,
        normalized_message_type: str,
        raw_content: Any,
        transparency: Optional[Dict[str, Any]],
    ) -> str:
        _ = self
        return resolve_rehydrated_content_helper(
            role=role,
            normalized_message_type=normalized_message_type,
            raw_content=raw_content,
            transparency=transparency,
        )

    def resolve_transparency_content(
        self,
        *,
        transparency: Dict[str, Any],
        message_key: str,
    ) -> Optional[str]:
        _ = self
        return resolve_transparency_content_helper(
            transparency=transparency,
            message_key=message_key,
        )

    def normalize_tool_calls(self, raw_tool_calls: Any) -> List[Dict[str, Any]]:
        return normalize_tool_calls_helper(raw_tool_calls)

    @staticmethod
    def build_assistant_tool_call_entry(
        *,
        content: str,
        call_id: str,
        call_name: str,
        call_arguments: Dict[str, Any],
        thought_signature: Optional[str],
        message_type: Optional[str],
        timestamp: Optional[str],
        image_data: Optional[str],
    ) -> Dict[str, Any]:
        tool_call_payload: Dict[str, Any] = {
            "id": call_id,
            "name": call_name,
            "arguments": dict(call_arguments),
        }
        if thought_signature is not None:
            tool_call_payload["thought_signature"] = thought_signature

        return {
            "role": "assistant",
            "content": content,
            "message_type": message_type,
            "tool_name": call_name,
            "correlation_id": call_id,
            "timestamp": timestamp,
            "image_data": image_data,
            "tool_calls": [tool_call_payload],
        }
