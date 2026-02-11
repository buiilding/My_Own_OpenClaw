"""
Query Message Handler.

Handles user query messages and streams responses back to the client.
"""

import logging
from typing import TYPE_CHECKING, Optional

from backend.src.api.infrastructure.handler import TypedMessageHandler

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager
from backend.src.api.infrastructure.errors import send_error_response
from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.api.processing.pipeline import StreamPipeline
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.transport.sender import WebSocketTransportSender
from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.processing.tts.processor import TTSProcessor
from backend.src.api.schema import QueryMessage
from backend.src.api.services.query_execution import QueryExecutionService
from backend.src.services.artifacts import ArtifactStore
from backend.src.core.validation.validators import (
    ValidationError,
)

logger = logging.getLogger(__name__)


class QueryMessageHandler(TypedMessageHandler[QueryMessage]):
    """
    Handler for user query messages.

    Processes incoming query messages from WebSocket clients, validates them,
    and orchestrates the complete query processing pipeline. This includes
    agent session management, LLM interaction, tool execution, and streaming
    responses back to the client.

    The handler supports:
    - Query validation and sanitization
    - Agent session creation/retrieval
    - Streaming response handling
    - Text-to-speech integration
    - Error handling and recovery
    - Response formatting for WebSocket transport
    """

    def __init__(
        self,
        session_manager: "SessionManager",
        tts_manager: TTSManager,
        response_formatter: ResponseFormatter,
    ):
        """
        Initialize the query handler.

        Args:
            session_manager: Session manager for handling agent sessions
                and WebSocket connections
            tts_manager: TTS manager for text-to-speech handling
            response_formatter: Response formatter for WebSocket messages
        """
        self.execution_service = QueryExecutionService(
            session_manager=session_manager,
            tts_manager=tts_manager,
            response_formatter=response_formatter,
        )

    message_model = QueryMessage

    async def handle_typed(
        self, message: QueryMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle a query message.

        Args:
            message: Validated QueryMessage Pydantic model
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        msg_id = message.id

        try:
            logger.info("[Timing] Query received from frontend (user_id=%s)", user_id)
            await self.execution_service.execute(
                message,
                websocket,
                user_id,
                pipeline_cls=StreamPipeline,
                artifact_store_cls=ArtifactStore,
                transport_sender_cls=WebSocketTransportSender,
                tts_processor_cls=TTSProcessor,
            )
        except ValidationError as e:
            await self._send_error(websocket, msg_id, f"Invalid query: {e.message}")
        except Exception as e:
            # Full details logged server-side, sanitized message sent to client
            await self._send_error(websocket, msg_id, None, exception=e)

    async def _send_error(
        self,
        websocket: WebSocketSender,
        msg_id: Optional[str],
        message: Optional[str] = None,
        exception: Optional[Exception] = None,
    ):
        """
        Send error response.

        Security: If exception is provided, message is sanitized to prevent information leakage.
        Full exception details are logged server-side.

        Handles connection errors gracefully - if connection is closed, logs and returns silently.

        Args:
            websocket: WebSocketSender (thread-safe protocol implementation)
            msg_id: Message ID (optional)
            message: Error message (optional, used if exception is None)
            exception: Optional exception to sanitize. If provided, message is ignored.
        """
        await send_error_response(websocket, msg_id, message or "", exception=exception)
