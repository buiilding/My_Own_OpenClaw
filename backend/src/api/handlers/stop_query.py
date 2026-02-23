"""Stop-query message handler."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.infrastructure.errors import send_error_response, send_success_response
from backend.src.api.infrastructure.handler import TypedMessageHandler
from backend.src.api.schema import StopQueryMessage
from backend.src.api.transport.protocol import WebSocketSender

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager


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
            canceled = self.session_manager.cancel_active_query_task(user_id)
            context: dict[str, Any] = {"user_id": user_id}

            session = self.session_manager.get_session(user_id)
            session_id = getattr(session, "session_id", None)
            if isinstance(session_id, str) and session_id:
                context["session_id"] = session_id

            if canceled is not None:
                turn_ref, conversation_ref = canceled
                if turn_ref:
                    context["turn_ref"] = turn_ref
                if conversation_ref:
                    context["conversation_ref"] = conversation_ref

            # Always emit completion so frontend leaves active streaming state.
            await send_success_response(
                websocket,
                message.id,
                OutgoingMessageType.STREAMING_COMPLETE,
                {},
                context=context,
            )
        except Exception as exc:  # pragma: no cover - defensive error path
            await send_error_response(websocket, message.id, None, exception=exc)
