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
_INTERNAL_BUNDLE_MESSAGE_TYPES = frozenset({"tool-bundle", "tool_bundle"})
_INTERNAL_BUNDLE_TOOL_NAMES = frozenset({"tool-bundle", "tool_bundle", "bundled_tools", "bundled-tools"})


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
        rehydrated_system_prompt: Optional[str] = None
        for index, entry in enumerate(payload.messages):
            transparency = self._normalize_transparency(getattr(entry, "transparency", None))
            if rehydrated_system_prompt is None:
                rehydrated_system_prompt = self._extract_system_prompt_from_transparency(
                    transparency
                )
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
                transparency=transparency,
            )
            hydrated_entries.extend(normalized_entries)

        self._apply_rehydrated_system_prompt(
            session=session,
            system_prompt=rehydrated_system_prompt,
        )
        await session.rehydrate_conversation(payload.conversation_ref, hydrated_entries)

    def _normalize_rehydrated_entry(
        self,
        *,
        entry: Any,
        index: int,
        image_data: Optional[str],
        known_tool_call_ids: set[str],
        pending_tool_call_id: Optional[str],
        transparency: Optional[Dict[str, Any]],
    ) -> tuple[List[Dict[str, Any]], Optional[str]]:
        normalized_message_type = self._normalize_message_type(entry.message_type)
        stored_message_type = self._normalize_stored_message_type(entry.message_type)
        normalized_tool_name = self._normalize_optional_string(entry.tool_name)
        correlation_id = self._normalize_optional_string(entry.correlation_id)
        explicit_tool_call_id = self._normalize_optional_string(entry.tool_call_id)
        message_tool_call_id = explicit_tool_call_id or correlation_id
        content = self._resolve_rehydrated_content(
            role=entry.role,
            normalized_message_type=normalized_message_type,
            raw_content=entry.content,
            transparency=transparency,
        )

        if self._is_internal_bundle_trace(
            normalized_message_type=normalized_message_type,
            normalized_tool_name=normalized_tool_name,
            content=content,
        ):
            assistant_entry = self._build_assistant_context_entry(
                content=content,
                timestamp=entry.timestamp,
                image_data=image_data,
            )
            if assistant_entry is None:
                return [], None
            return [assistant_entry], None

        if normalized_message_type in _TOOL_CALL_MESSAGE_TYPES:
            call_name, call_arguments, parsed_call_id, thought_signature = self._extract_tool_call_details(
                content=content,
                fallback_tool_name=normalized_tool_name,
            )
            call_id = message_tool_call_id or parsed_call_id or f"rehydrate_tool_call_{index}"
            known_tool_call_ids.add(call_id)
            return (
                [
                    self._build_assistant_tool_call_entry(
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
            if call_id is None and pending_tool_call_id:
                call_id = pending_tool_call_id
            if call_id is None:
                call_id = f"rehydrate_tool_call_{index}"

            entries: List[Dict[str, Any]] = []
            if call_id not in known_tool_call_ids:
                call_name, call_arguments, _, thought_signature = self._extract_tool_call_details(
                    content=content,
                    fallback_tool_name=normalized_tool_name,
                )
                entries.append(
                    self._build_assistant_tool_call_entry(
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
                known_tool_call_ids.add(call_id)

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
        normalized_tool_calls = self._normalize_tool_calls(entry.tool_calls)
        if entry.role == "assistant" and normalized_tool_calls:
            hydrated_entry["tool_calls"] = normalized_tool_calls
            for tool_call in normalized_tool_calls:
                known_tool_call_ids.add(tool_call["id"])
            return [hydrated_entry], normalized_tool_calls[-1]["id"]

        return [hydrated_entry], None

    @staticmethod
    def _build_assistant_context_entry(
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
    ) -> tuple[str, Dict[str, Any], Optional[str], Optional[str]]:
        tool_name = fallback_tool_name or "unknown_tool"
        arguments: Dict[str, Any] = {}
        tool_call_id: Optional[str] = None
        thought_signature: Optional[str] = None
        if not isinstance(content, str) or not content.strip():
            return tool_name, arguments, tool_call_id, thought_signature

        try:
            payload = json.loads(content)
        except (TypeError, ValueError):
            return tool_name, arguments, tool_call_id, thought_signature

        if not isinstance(payload, dict):
            return tool_name, arguments, tool_call_id, thought_signature

        function_payload = payload.get("function")
        if not isinstance(function_payload, dict):
            function_payload = None

        parsed_name = self._normalize_optional_string(
            payload.get("name")
            if function_payload is None
            else payload.get("name") or function_payload.get("name")
        )
        if parsed_name:
            tool_name = parsed_name
        parsed_call_id = self._normalize_optional_string(
            payload.get("id")
            if function_payload is None
            else payload.get("id") or function_payload.get("id")
        )
        if parsed_call_id:
            tool_call_id = parsed_call_id
        parsed_arguments = payload.get("args")
        if isinstance(parsed_arguments, dict):
            arguments = dict(parsed_arguments)
        elif isinstance(payload.get("arguments"), dict):
            arguments = dict(payload["arguments"])
        elif function_payload is not None:
            function_arguments = function_payload.get("arguments")
            if isinstance(function_arguments, dict):
                arguments = dict(function_arguments)
            elif isinstance(function_arguments, str) and function_arguments.strip():
                try:
                    decoded_arguments = json.loads(function_arguments)
                except (TypeError, ValueError):
                    decoded_arguments = None
                if isinstance(decoded_arguments, dict):
                    arguments = decoded_arguments

        thought_signature = self._extract_thought_signature(
            payload,
            function_payload,
        )

        return tool_name, arguments, tool_call_id, thought_signature

    @classmethod
    def _is_internal_bundle_trace(
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
    def _extract_thought_signature(*sources: Optional[Dict[str, Any]]) -> Optional[str]:
        for source in sources:
            if not isinstance(source, dict):
                continue
            for key in ("thought_signature", "thoughtSignature"):
                raw_signature = source.get(key)
                if isinstance(raw_signature, str) and raw_signature.strip():
                    return raw_signature.strip()
        return None

    @staticmethod
    def _normalize_transparency(
        transparency: Any,
    ) -> Optional[Dict[str, Any]]:
        if not isinstance(transparency, dict):
            return None
        return dict(transparency)

    def _extract_system_prompt_from_transparency(
        self,
        transparency: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        if not isinstance(transparency, dict):
            return None
        return self._normalize_optional_string(transparency.get("systemPrompt"))

    def _resolve_rehydrated_content(
        self,
        *,
        role: Any,
        normalized_message_type: str,
        raw_content: Any,
        transparency: Optional[Dict[str, Any]],
    ) -> str:
        base_content = raw_content if isinstance(raw_content, str) else ""
        if not isinstance(transparency, dict):
            return base_content

        normalized_role = str(role or "").strip().lower()
        if normalized_role == "user":
            full_user_content = self._resolve_transparency_content(
                transparency=transparency,
                message_key="fullUserMessage",
            )
            return full_user_content or base_content

        if normalized_role == "assistant" and normalized_message_type in {
            "",
            "llm-text",
            "assistant",
            "assistant-response",
            "assistant-message",
        }:
            full_assistant_content = self._resolve_transparency_content(
                transparency=transparency,
                message_key="fullAssistantMessage",
            )
            return full_assistant_content or base_content

        return base_content

    def _resolve_transparency_content(
        self,
        *,
        transparency: Dict[str, Any],
        message_key: str,
    ) -> Optional[str]:
        payload = transparency.get(message_key)
        if not isinstance(payload, dict):
            return None
        return self._normalize_optional_string(payload.get("content"))

    def _apply_rehydrated_system_prompt(
        self,
        *,
        session: Any,
        system_prompt: Optional[str],
    ) -> None:
        if not system_prompt:
            return
        history = getattr(session, "history", None)
        if history is None:
            logger.warning(
                "Skipping rehydrate system prompt restore: session history missing (session=%s)",
                type(session).__name__,
            )
            return
        setattr(history, "system_prompt", system_prompt)

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
            thought_signature: Optional[str] = None

            for key in ("thought_signature", "thoughtSignature"):
                raw_signature = raw_call.get(key)
                if isinstance(raw_signature, str) and raw_signature.strip():
                    thought_signature = raw_signature.strip()
                    break

            if isinstance(raw_call.get("name"), str) and raw_call.get("name", "").strip():
                call_name = raw_call["name"].strip()
                if isinstance(raw_call.get("arguments"), dict):
                    call_arguments = dict(raw_call["arguments"])
            elif raw_call.get("type") == "function" and isinstance(raw_call.get("function"), dict):
                function_block = raw_call["function"]
                if isinstance(function_block.get("name"), str) and function_block.get("name", "").strip():
                    call_name = function_block["name"].strip()
                if thought_signature is None:
                    for key in ("thought_signature", "thoughtSignature"):
                        function_signature = function_block.get(key)
                        if isinstance(function_signature, str) and function_signature.strip():
                            thought_signature = function_signature.strip()
                            break
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

            normalized_call: Dict[str, Any] = {
                "id": call_id.strip(),
                "name": call_name,
                "arguments": call_arguments,
            }
            if thought_signature is not None:
                normalized_call["thought_signature"] = thought_signature
            normalized_calls.append(normalized_call)
        return normalized_calls

    @staticmethod
    def _build_assistant_tool_call_entry(
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
