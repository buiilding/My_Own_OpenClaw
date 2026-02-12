"""Conversation rehydrate execution service."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Type

from backend.src.api.schema import RehydrateConversationMessage
from backend.src.services.artifacts import ArtifactStore

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


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
        for index, entry in enumerate(payload.messages):
            image_data = self._resolve_image_data(
                artifact_store=artifact_store,
                screenshot=entry.screenshot,
                screenshot_ref=entry.screenshot_ref,
                index=index,
            )
            hydrated_entries.append(
                {
                    "role": entry.role,
                    "content": entry.content,
                    "message_type": entry.message_type,
                    "tool_name": entry.tool_name,
                    "correlation_id": entry.correlation_id,
                    "timestamp": entry.timestamp,
                    "image_data": image_data,
                }
            )

        await session.rehydrate_conversation(payload.conversation_ref, hydrated_entries)

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
