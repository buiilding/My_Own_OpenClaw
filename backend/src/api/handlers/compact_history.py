"""Manual conversation-history compaction handler."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from backend.src.agent.session.model_history_ledger import (
    build_model_history_checkpoint,
)
from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.handlers.context import build_user_session_context
from backend.src.api.infrastructure.errors import send_success_response
from backend.src.api.infrastructure.handler import TypedMessageHandler
from backend.src.api.schemas.incoming import CompactHistoryMessage
from backend.src.api.transport.envelope import StreamEventSequencer
from backend.src.api.transport.protocol import WebSocketSender

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


def _build_manual_compaction_context(
    *,
    user_id: str,
    session: object | None,
    conversation_ref: str | None,
    message_id: str | None,
) -> dict:
    context = build_user_session_context(user_id=user_id, session=session)
    if conversation_ref:
        context["conversation_ref"] = conversation_ref
    if message_id:
        context["turn_ref"] = message_id
        context["stream_event_sequencer"] = StreamEventSequencer(turn_ref=message_id)
    return context


class CompactHistoryHandler(TypedMessageHandler[CompactHistoryMessage]):
    """Handle manual `compact-history` requests."""

    message_model = CompactHistoryMessage

    def __init__(self, session_manager: "SessionManager"):
        self.session_manager = session_manager

    async def handle_typed(
        self,
        message: CompactHistoryMessage,
        websocket: WebSocketSender,
        user_id: str,
    ) -> None:
        force = bool(message.payload.force)
        conversation_ref = message.payload.conversation_ref
        logger.info(
            "Manual compaction requested (user_id=%s, conversation_ref=%s, force=%s, msg_id=%s)",
            user_id,
            conversation_ref,
            force,
            message.id,
        )
        if self.session_manager.has_active_query_task(
            user_id,
            conversation_ref=conversation_ref,
        ):
            context = _build_manual_compaction_context(
                user_id=user_id,
                session=None,
                conversation_ref=conversation_ref,
                message_id=message.id,
            )
            error_text = (
                "Cannot compact history while a query is active. "
                "Stop the current query and retry."
            )
            logger.info(
                "Manual compaction rejected: active query in progress "
                "(user_id=%s, conversation_ref=%s, msg_id=%s)",
                user_id,
                conversation_ref,
                message.id,
            )
            await send_success_response(
                websocket,
                message.id,
                OutgoingMessageType.CONTEXT_COMPACTION_FAILED,
                {
                    "reason": "manual",
                    "strategy": "manual",
                    "error": error_text,
                    "before_tokens": None,
                },
                context=context,
            )
            return

        session = await self.session_manager.get_or_create_session(
            user_id,
            conversation_ref=conversation_ref,
        )
        context = _build_manual_compaction_context(
            user_id=user_id,
            session=session,
            conversation_ref=conversation_ref,
            message_id=message.id,
        )

        decision, result = await session.run_history_compaction(
            reason="manual",
            force=force,
        )

        if decision.should_compact:
            await send_success_response(
                websocket,
                message.id,
                OutgoingMessageType.CONTEXT_COMPACTION_STARTED,
                {
                    "reason": "manual",
                    "strategy": decision.strategy_name,
                    "before_tokens": decision.before_tokens,
                    "projected_tokens": decision.projected_tokens,
                },
                context=context,
            )

        if result.applied:
            logger.info(
                "Manual compaction applied (user_id=%s, strategy=%s, before=%s, after=%s, removed=%s)",
                user_id,
                result.strategy_name,
                result.before_tokens,
                result.after_tokens,
                result.removed_messages,
            )
        else:
            logger.info(
                "Manual compaction completed without changes (user_id=%s, strategy=%s, skipped_reason=%s)",
                user_id,
                result.strategy_name,
                result.skip_reason or "not-applied",
            )

        if result.applied:
            summary_preview = (result.summary_text or "").strip()
            await send_success_response(
                websocket,
                message.id,
                OutgoingMessageType.CONTEXT_COMPACTION_COMPLETED,
                {
                    "reason": "manual",
                    "strategy": result.strategy_name,
                    "before_tokens": result.before_tokens,
                    "after_tokens": result.after_tokens,
                    "removed_messages": result.removed_messages,
                    "summary_preview": summary_preview or None,
                    "summary_text": result.summary_text or None,
                    "replacement_history_preview": [
                        {
                            "role": entry.role,
                            "message_type": entry.message_type,
                            "content": entry.content,
                            "tool_name": entry.tool_name,
                            "tool_call_id": entry.tool_call_id,
                        }
                        for entry in result.replacement_history_preview
                    ],
                    "replacement_history_entries": result.replacement_history_entries,
                    "skipped_reason": None,
                },
                context=context,
            )
            checkpoint = build_model_history_checkpoint(
                session.history,
                conversation_ref=conversation_ref
                or getattr(session.runtime, "active_conversation_ref", None),
                revision_id=getattr(session.runtime, "active_revision_id", None),
                turn_ref=message.id,
            )
            if checkpoint is not None:
                await send_success_response(
                    websocket,
                    message.id,
                    OutgoingMessageType.MODEL_HISTORY_UPDATED,
                    {
                        "conversation_ref": checkpoint["conversation_ref"],
                        "revision_id": checkpoint["revision_id"],
                        "checkpoint_id": checkpoint["checkpoint_id"],
                        "created_at": checkpoint["created_at"],
                        "rows": checkpoint["rows"],
                    },
                    context=context,
                )
            return

        await send_success_response(
            websocket,
            message.id,
            OutgoingMessageType.CONTEXT_COMPACTION_COMPLETED,
            {
                "reason": "manual",
                "strategy": result.strategy_name,
                "before_tokens": result.before_tokens,
                "after_tokens": result.after_tokens,
                "removed_messages": result.removed_messages,
                "summary_preview": None,
                "summary_text": result.summary_text or None,
                "replacement_history_preview": [],
                "replacement_history_entries": [],
                "skipped_reason": result.skip_reason or "not-applied",
            },
            context=context,
        )
