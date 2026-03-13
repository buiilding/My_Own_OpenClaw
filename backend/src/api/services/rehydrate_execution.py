"""Conversation rehydrate execution service."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Type

from backend.src.api.schema import RehydrateConversationMessage
from backend.src.api.services.rehydrate_entry_normalization import (
    RehydrateEntryNormalizer,
    RehydrateNormalizationState,
)
from backend.src.services.artifacts import ArtifactStore

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


class RehydrateExecutionService:
    """Rebuild session conversation history from frontend transcript snapshot."""

    def __init__(self, session_manager: "SessionManager") -> None:
        self._session_manager = session_manager
        self._entry_normalizer = RehydrateEntryNormalizer()

    async def execute(
        self,
        message: RehydrateConversationMessage,
        user_id: str,
        *,
        artifact_store_cls: Type[ArtifactStore] = ArtifactStore,
    ) -> None:
        payload = message.payload
        session = await self._session_manager.get_or_create_session(
            user_id,
            conversation_ref=payload.conversation_ref,
        )
        artifact_store = self._build_artifact_store(artifact_store_cls)

        state = RehydrateNormalizationState()
        hydrated_entries: List[Dict[str, Any]] = []
        rehydrated_system_prompt: Optional[str] = None
        last_timestamp: Optional[str] = None

        for index, entry in enumerate(payload.messages):
            last_timestamp = getattr(entry, "timestamp", None)
            transparency = self._entry_normalizer.normalize_transparency(
                getattr(entry, "transparency", None)
            )
            if rehydrated_system_prompt is None:
                rehydrated_system_prompt = self._entry_normalizer.extract_system_prompt_from_transparency(
                    transparency
                )

            image_data = self._resolve_image_data(
                artifact_store=artifact_store,
                screenshot=entry.screenshot,
                screenshot_ref=entry.screenshot_ref,
                index=index,
            )

            normalized_entries, _ = self._entry_normalizer.normalize_entry(
                entry=entry,
                index=index,
                image_data=image_data,
                transparency=transparency,
                state=state,
            )
            hydrated_entries.extend(normalized_entries)

        hydrated_entries.extend(
            self._entry_normalizer.finalize_pending_tool_call_entries(
                state=state,
                timestamp=last_timestamp,
            )
        )

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
        """
        Compatibility wrapper for tests that assert per-entry normalization behavior.
        """
        state = RehydrateNormalizationState(
            known_tool_call_ids=known_tool_call_ids,
            pending_tool_call_ids=[pending_tool_call_id] if pending_tool_call_id else [],
        )
        return self._entry_normalizer.normalize_entry(
            entry=entry,
            index=index,
            image_data=image_data,
            transparency=transparency,
            state=state,
        )

    def _extract_tool_call_details(
        self,
        *,
        content: str,
        fallback_tool_name: Optional[str],
    ) -> tuple[str, Dict[str, Any], Optional[str], Optional[str]]:
        return self._entry_normalizer.extract_tool_call_details(
            content=content,
            fallback_tool_name=fallback_tool_name,
        )

    @classmethod
    def _normalize_stored_message_type(cls, message_type: Optional[str]) -> Optional[str]:
        return RehydrateEntryNormalizer.normalize_stored_message_type(message_type)

    @staticmethod
    def _normalize_tool_calls(raw_tool_calls: Any) -> List[Dict[str, Any]]:
        normalizer = RehydrateEntryNormalizer()
        return normalizer.normalize_tool_calls(raw_tool_calls)

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
