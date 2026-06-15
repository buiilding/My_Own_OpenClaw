"""Stop-query message handler."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.infrastructure.errors import (
    send_error_response,
    send_success_response,
)
from backend.src.api.infrastructure.handler import TypedMessageHandler
from backend.src.api.schemas import StopQueryMessage
from backend.src.api.transport.protocol import WebSocketSender

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


class StopQueryHandler(TypedMessageHandler[StopQueryMessage]):
    """Cancel the active query task for a user."""

    message_model = StopQueryMessage

    def __init__(self, session_manager: "SessionManager"):
        self.session_manager = session_manager

    async def handle_typed(
        self,
        message: StopQueryMessage,
        websocket: WebSocketSender,
        user_id: str,
    ) -> None:
        try:
            conversation_ref = message.payload.conversation_ref
            turn_ref = message.payload.turn_ref
            canceled = self.session_manager.cancel_active_query_task(
                user_id,
                conversation_ref=conversation_ref,
                turn_ref=turn_ref,
            )
            context: dict[str, Any] = {"user_id": user_id}
            if conversation_ref:
                context["conversation_ref"] = conversation_ref
            if turn_ref:
                context["turn_ref"] = turn_ref

            session = self.session_manager.get_session(
                user_id,
                conversation_ref=conversation_ref,
            )
            session_id = getattr(session, "session_id", None)
            if isinstance(session_id, str) and session_id:
                context["session_id"] = session_id

            if canceled is not None:
                canceled_turn_ref, canceled_conversation_ref = canceled
                if canceled_turn_ref:
                    context["turn_ref"] = canceled_turn_ref
                if canceled_conversation_ref:
                    context["conversation_ref"] = canceled_conversation_ref
                logger.info(
                    "[Stop Query] User requested stop; cancellation signaled "
                    "(user_id=%s, turn_ref=%s, conversation_ref=%s, session_id=%s)",
                    user_id,
                    canceled_turn_ref,
                    canceled_conversation_ref,
                    context.get("session_id"),
                )
            else:
                logger.info(
                    "[Stop Query] User requested stop but no active query task was running "
                    "(user_id=%s, turn_ref=%s, conversation_ref=%s, session_id=%s)",
                    user_id,
                    turn_ref,
                    conversation_ref,
                    context.get("session_id"),
                )

            await send_success_response(
                websocket,
                message.id,
                OutgoingMessageType.STOP_QUERY_ACK,
                {
                    "status": "stopped" if canceled is not None else "not-running",
                    "canceled": canceled is not None,
                    "conversation_ref": context.get("conversation_ref"),
                    "turn_ref": context.get("turn_ref"),
                },
                context=context,
            )
        except Exception as exc:  # pragma: no cover - defensive error path
            logger.error(
                "[Stop Query] Failed to process stop request (user_id=%s): %s",
                user_id,
                exc,
                exc_info=True,
            )
            await send_error_response(websocket, message.id, None, exception=exc)
