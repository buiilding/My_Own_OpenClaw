"""Conversation rehydrate execution service."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Type

from backend.src.api.schema import RehydrateConversationMessage
from backend.src.services.artifacts import ArtifactStore

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)

_TOOL_CALL_MESSAGE_TYPES = frozenset({"tool-call", "tool_call", "tool-bundle", "tool_bundle"})
_TOOL_OUTPUT_MESSAGE_TYPES = frozenset({"tool-output", "tool_output", "tool-result", "tool_result"})


class RehydrateExecutionService:
    """Rebuild session conversation history from frontend transcript snapshot."""

    def __init__(self, session_manager: "SessionManager") -> None:
        self._session_manager = session_manager

    async def execute(
        self,
        message: RehydrateConversationMessage,
        user_id: str,
        *,
        artifact_store_cls: Type[ArtifactStore] = ArtifactStore,
    ) -> None:
        payload = message.payload
        session = await self._session_manager.get_or_create_session(user_id)
        artifact_store = self._build_artifact_store(artifact_store_cls)

        hydrated_entries: List[Dict[str, Any]] = []
        known_tool_call_ids: set[str] = set()
        pending_tool_call_id: Optional[str] = None
        for index, entry in enumerate(payload.messages):
            image_data = self._resolve_image_data(
                artifact_store=artifact_store,
                screenshot=entry.screenshot,
                screenshot_ref=entry.screenshot_ref,
                index=index,
            )

            normalized_entries, pending_tool_call_id = self._normalize_rehydrated_entry(
                entry=entry,
                index=index,
                image_data=image_data,
                known_tool_call_ids=known_tool_call_ids,
                pending_tool_call_id=pending_tool_call_id,
            )
            hydrated_entries.extend(normalized_entries)

        await session.rehydrate_conversation(payload.conversation_ref, hydrated_entries)

    def _normalize_rehydrated_entry(
        self,
        *,
        entry: Any,
        index: int,
        image_data: Optional[str],
        known_tool_call_ids: set[str],
        pending_tool_call_id: Optional[str],
    ) -> tuple[List[Dict[str, Any]], Optional[str]]:
        normalized_message_type = self._normalize_message_type(entry.message_type)
        stored_message_type = self._normalize_stored_message_type(entry.message_type)
        normalized_tool_name = self._normalize_optional_string(entry.tool_name)
        correlation_id = self._normalize_optional_string(entry.correlation_id)
        explicit_tool_call_id = self._normalize_optional_string(entry.tool_call_id)
        message_tool_call_id = explicit_tool_call_id or correlation_id

        if normalized_message_type in _TOOL_CALL_MESSAGE_TYPES:
            call_id = message_tool_call_id or f"rehydrate_tool_call_{index}"
            call_name, call_arguments = self._extract_tool_call_details(
                content=entry.content,
                fallback_tool_name=normalized_tool_name,
            )
            known_tool_call_ids.add(call_id)
            return (
                [
                    self._build_assistant_tool_call_entry(
                        content=entry.content,
                        call_id=call_id,
                        call_name=call_name,
                        call_arguments=call_arguments,
                        message_type=stored_message_type,
                        timestamp=entry.timestamp,
                        image_data=image_data,
                    )
                ],
                call_id,
            )

        if entry.role == "tool" or normalized_message_type in _TOOL_OUTPUT_MESSAGE_TYPES:
            call_id = message_tool_call_id
            if call_id is None and pending_tool_call_id:
                call_id = pending_tool_call_id
            if call_id is None:
                call_id = f"rehydrate_tool_call_{index}"

            entries: List[Dict[str, Any]] = []
            if call_id not in known_tool_call_ids:
                call_name, call_arguments = self._extract_tool_call_details(
                    content=entry.content,
                    fallback_tool_name=normalized_tool_name,
                )
                entries.append(
                    self._build_assistant_tool_call_entry(
                        content="",
                        call_id=call_id,
                        call_name=call_name,
                        call_arguments=call_arguments,
                        message_type="tool-call",
                        timestamp=entry.timestamp,
                        image_data=None,
                    )
                )
                known_tool_call_ids.add(call_id)

            entries.append(
                {
                    "role": "tool",
                    "content": entry.content,
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
            "content": entry.content,
            "message_type": stored_message_type,
            "tool_name": normalized_tool_name,
            "correlation_id": correlation_id,
            "timestamp": entry.timestamp,
            "image_data": image_data,
        }
        normalized_tool_calls = self._normalize_tool_calls(entry.tool_calls)
        if entry.role == "assistant" and normalized_tool_calls:
            hydrated_entry["tool_calls"] = normalized_tool_calls
            for tool_call in normalized_tool_calls:
                known_tool_call_ids.add(tool_call["id"])
            return [hydrated_entry], normalized_tool_calls[-1]["id"]

        return [hydrated_entry], None

    @staticmethod
    def _normalize_message_type(message_type: Optional[str]) -> str:
        if not isinstance(message_type, str):
            return ""
        return message_type.strip().lower().replace("_", "-")

    @classmethod
    def _normalize_stored_message_type(cls, message_type: Optional[str]) -> Optional[str]:
        normalized = cls._normalize_message_type(message_type)
        if normalized in {"context-compaction", "context-summary"}:
            return "context-compaction"
        return message_type

    @staticmethod
    def _normalize_optional_string(value: Optional[str]) -> Optional[str]:
        if not isinstance(value, str):
            return None
        normalized = value.strip()
        return normalized or None

    def _extract_tool_call_details(
        self,
        *,
        content: str,
        fallback_tool_name: Optional[str],
    ) -> tuple[str, Dict[str, Any]]:
        tool_name = fallback_tool_name or "unknown_tool"
        arguments: Dict[str, Any] = {}
        if not isinstance(content, str) or not content.strip():
            return tool_name, arguments

        try:
            payload = json.loads(content)
        except (TypeError, ValueError):
            return tool_name, arguments

        if not isinstance(payload, dict):
            return tool_name, arguments

        parsed_name = self._normalize_optional_string(payload.get("name"))
        if parsed_name:
            tool_name = parsed_name
        parsed_arguments = payload.get("args")
        if isinstance(parsed_arguments, dict):
            arguments = dict(parsed_arguments)
        elif isinstance(payload.get("arguments"), dict):
            arguments = dict(payload["arguments"])

        return tool_name, arguments

    @staticmethod
    def _normalize_tool_calls(raw_tool_calls: Any) -> List[Dict[str, Any]]:
        if not isinstance(raw_tool_calls, list):
            return []

        normalized_calls: List[Dict[str, Any]] = []
        for index, raw_call in enumerate(raw_tool_calls):
            if not isinstance(raw_call, dict):
                continue
            call_id = raw_call.get("id")
            if not isinstance(call_id, str) or not call_id.strip():
                continue

            call_name: Optional[str] = None
            call_arguments: Dict[str, Any] = {}

            if isinstance(raw_call.get("name"), str) and raw_call.get("name", "").strip():
                call_name = raw_call["name"].strip()
                if isinstance(raw_call.get("arguments"), dict):
                    call_arguments = dict(raw_call["arguments"])
            elif raw_call.get("type") == "function" and isinstance(raw_call.get("function"), dict):
                function_block = raw_call["function"]
                if isinstance(function_block.get("name"), str) and function_block.get("name", "").strip():
                    call_name = function_block["name"].strip()
                function_arguments = function_block.get("arguments")
                if isinstance(function_arguments, dict):
                    call_arguments = dict(function_arguments)
                elif isinstance(function_arguments, str) and function_arguments.strip():
                    try:
                        decoded_arguments = json.loads(function_arguments)
                    except (TypeError, ValueError):
                        decoded_arguments = None
                    if isinstance(decoded_arguments, dict):
                        call_arguments = decoded_arguments

            if not call_name:
                call_name = f"unknown_tool_{index}"

            normalized_calls.append(
                {
                    "id": call_id.strip(),
                    "name": call_name,
                    "arguments": call_arguments,
                }
            )
        return normalized_calls

    @staticmethod
    def _build_assistant_tool_call_entry(
        *,
        content: str,
        call_id: str,
        call_name: str,
        call_arguments: Dict[str, Any],
        message_type: Optional[str],
        timestamp: Optional[str],
        image_data: Optional[str],
    ) -> Dict[str, Any]:
        return {
            "role": "assistant",
            "content": content,
            "message_type": message_type,
            "tool_name": call_name,
            "correlation_id": call_id,
            "timestamp": timestamp,
            "image_data": image_data,
            "tool_calls": [
                {
                    "id": call_id,
                    "name": call_name,
                    "arguments": dict(call_arguments),
                }
            ],
        }

    def _build_artifact_store(
        self,
        artifact_store_cls: Type[ArtifactStore],
    ) -> Optional[ArtifactStore]:
        try:
            return artifact_store_cls.from_config(self._session_manager.config)
        except Exception as exc:
            logger.warning("Failed to create artifact store for rehydrate: %s", exc)
            return None

    def _resolve_image_data(
        self,
        *,
        artifact_store: Optional[ArtifactStore],
        screenshot: Optional[str],
        screenshot_ref: Optional[str],
        index: int,
    ) -> Optional[str]:
        if screenshot:
            return screenshot
        if not screenshot_ref:
            return None
        if artifact_store is None:
            raise ValueError(
                f"Unable to resolve screenshot_ref at message index {index}: artifact store unavailable"
            )
        try:
            return artifact_store.load_base64(screenshot_ref)
        except Exception as exc:
            logger.warning(
                "Failed to resolve screenshot_ref during rehydrate (index=%s, ref=%s): %s. "
                "Continuing without screenshot.",
                index,
                screenshot_ref,
                exc,
            )
            return None
