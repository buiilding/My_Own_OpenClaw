"""Conversation rehydrate execution service."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Type, Union

from backend.src.api.schemas.incoming import RehydrateConversationMessage
from backend.src.api.services.rehydrate_entry_normalization import (
    RehydrateEntryNormalizer,
)
from backend.src.api.services.rehydrate_tool_linkage import RehydrateToolLinkageState
from backend.src.api.services.rehydrate_transparency_resolution import (
    extract_system_prompt_from_transparency,
    normalize_transparency,
)
from backend.src.services.artifacts.store import ArtifactStore

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


class RehydrateExecutionService:
    """Rebuild session conversation history from an SDK rehydrate snapshot."""

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
        self._apply_session_workspace_path(
            user_id=user_id,
            session=session,
            workspace_path=payload.workspace_path,
            repo_instruction_messages=[
                {
                    "role": instruction.role,
                    "content": instruction.content,
                }
                for instruction in (payload.repo_instruction_messages or [])
            ],
        )
        if payload.model_history is not None:
            await self._install_model_history_checkpoint(
                session=session,
                conversation_ref=payload.conversation_ref,
                revision_id=payload.model_history.revision_id,
                rows=payload.model_history.rows,
            )
            return

        artifact_store = self._build_artifact_store(artifact_store_cls)

        state = RehydrateToolLinkageState()
        hydrated_entries: List[Dict[str, Any]] = []
        rehydrated_system_prompt: Optional[str] = None

        for index, entry in enumerate(payload.messages):
            transparency = normalize_transparency(getattr(entry, "transparency", None))
            if rehydrated_system_prompt is None:
                rehydrated_system_prompt = extract_system_prompt_from_transparency(
                    transparency
                )

            image_data = self._resolve_image_data(
                artifact_store=artifact_store,
                user_id=user_id,
                entry=entry,
                screenshot_ref=entry.screenshot_ref,
                index=index,
            )

            normalized_entries = self._entry_normalizer.normalize_entry(
                entry=entry,
                index=index,
                image_data=image_data,
                transparency=transparency,
                state=state,
            )
            hydrated_entries.extend(normalized_entries)

        state.require_no_pending_tool_calls()

        self._apply_rehydrated_system_prompt(
            session=session,
            system_prompt=rehydrated_system_prompt,
        )
        await session.rehydrate_conversation(payload.conversation_ref, hydrated_entries)

    async def _install_model_history_checkpoint(
        self,
        *,
        session: Any,
        conversation_ref: str,
        revision_id: str,
        rows: list[Any],
    ) -> None:
        entries: List[Dict[str, Any]] = []
        system_prompt: Optional[str] = None
        for row in rows:
            row_data = row.model_dump(exclude_none=True)
            if row_data.get("conversation_ref") != conversation_ref:
                raise ValueError(
                    "model_history row conversation_ref does not match rehydrate conversation_ref"
                )
            if row_data.get("revision_id") != revision_id:
                raise ValueError(
                    "model_history row revision_id does not match checkpoint revision_id"
                )
            if row_data.get("role") == "system":
                content = row_data.get("content")
                if system_prompt is None and isinstance(content, str) and content:
                    system_prompt = content
                continue
            entries.append(row_data)

        installer = getattr(session, "install_model_history", None)
        if callable(installer):
            await installer(
                conversation_ref=conversation_ref,
                revision_id=revision_id,
                entries=entries,
                system_prompt=system_prompt,
            )
            return

        await session.rehydrate_conversation(conversation_ref, entries)
        if system_prompt:
            self._apply_rehydrated_system_prompt(
                session=session,
                system_prompt=system_prompt,
            )

    def _apply_session_workspace_path(
        self,
        *,
        user_id: str,
        session: Any,
        workspace_path: Optional[str],
        repo_instruction_messages: Optional[list[dict[str, str]]] = None,
    ) -> None:
        self._session_manager.set_session_workspace_path(
            user_id,
            session,
            workspace_path,
            repo_instruction_messages,
        )

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
        user_id: str,
        entry: Any,
        screenshot_ref: Optional[str],
        index: int,
    ) -> Optional[Union[str, List[str]]]:
        if not screenshot_ref:
            return None
        if artifact_store is None:
            raise ValueError(
                f"Unable to resolve screenshot_ref at message index {index}: artifact store unavailable"
            )
        try:
            return artifact_store.load_base64(
                screenshot_ref,
                owner_user_id=user_id,
            )
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
