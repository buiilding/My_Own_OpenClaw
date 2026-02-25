"""Manual conversation-history compaction handler."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.infrastructure.errors import send_error_response, send_success_response
from backend.src.api.infrastructure.handler import TypedMessageHandler
from backend.src.api.schema import CompactHistoryMessage
from backend.src.api.transport.protocol import WebSocketSender

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


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
        context = self._build_context(session=session, user_id=user_id)

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

    @staticmethod
    def _build_context(*, session: Any, user_id: str) -> dict[str, Any]:
        context: dict[str, Any] = {"user_id": user_id}
        session_id = getattr(session, "session_id", None)
        if isinstance(session_id, str) and session_id:
            context["session_id"] = session_id
        runtime = getattr(session, "runtime", None)
        if runtime is not None:
            conversation_ref = getattr(runtime, "active_conversation_ref", None)
            if isinstance(conversation_ref, str) and conversation_ref:
                context["conversation_ref"] = conversation_ref
        return context

