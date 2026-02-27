"""Manual conversation-history compaction handler."""

from __future__ import annotations

from typing import TYPE_CHECKING

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.handlers.context import build_user_session_context
from backend.src.api.infrastructure.errors import send_error_response, send_success_response
from backend.src.api.infrastructure.handler import TypedMessageHandler
from backend.src.api.schema import CompactHistoryMessage
from backend.src.api.transport.protocol import WebSocketSender

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager


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
        if self.session_manager.has_active_query_task(user_id):
            await send_error_response(
                websocket,
                message.id,
                "Cannot compact history while a query is active. Stop the current query and retry.",
            )
            return

        session = await self.session_manager.get_or_create_session(user_id)
        context = build_user_session_context(user_id=user_id, session=session)

        decision, result = await session.run_history_compaction(
            reason="manual",
            force=bool(message.payload.force),
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
            summary_preview = (result.summary_text or "").strip()
            if len(summary_preview) > 180:
                summary_preview = f"{summary_preview[:177]}..."
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
                    "skipped_reason": None,
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
                "skipped_reason": result.skip_reason or "not-applied",
            },
            context=context,
        )
