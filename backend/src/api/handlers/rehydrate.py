"""Rehydrate conversation message handler."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from backend.src.api.infrastructure.errors import send_error_response
from backend.src.api.infrastructure.handler import TypedMessageHandler
from backend.src.api.schema import RehydrateConversationMessage
from backend.src.api.services.rehydrate_execution import RehydrateExecutionService
from backend.src.api.transport.protocol import WebSocketSender

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


class RehydrateConversationHandler(TypedMessageHandler[RehydrateConversationMessage]):
    """Apply a frontend transcript snapshot to backend in-memory history."""

    message_model = RehydrateConversationMessage

    def __init__(self, session_manager: "SessionManager") -> None:
        self.execution_service = RehydrateExecutionService(session_manager=session_manager)

    async def handle_typed(
        self,
        message: RehydrateConversationMessage,
        websocket: WebSocketSender,
        user_id: str,
    ) -> None:
        try:
            await self.execution_service.execute(message, user_id)
        except Exception as exc:
            await self._send_error(websocket, message.id, exception=exc)

    async def _send_error(
        self,
        websocket: WebSocketSender,
        msg_id: Optional[str],
        *,
        exception: Optional[Exception] = None,
    ) -> None:
        await send_error_response(websocket, msg_id, "", exception=exception)
