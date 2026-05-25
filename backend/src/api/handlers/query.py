"""
Query Message Handler.

Handles user query messages and streams responses back to the client.
"""

import asyncio
import logging
from typing import TYPE_CHECKING, Optional

from backend.src.agent.session.active_query_tracker import (
    ACTIVE_QUERY_GLOBAL_LIMIT,
    ACTIVE_QUERY_STOP_CONSUMED,
    ACTIVE_QUERY_USER_LIMIT,
)
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
from backend.src.api.schemas import QueryMessage
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
        self.session_manager = session_manager
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
        turn_ref = msg_id
        current_task = asyncio.current_task()
        config = getattr(self.session_manager, "config", None)
        max_active_queries_per_user = int(
            getattr(config, "max_active_queries_per_user", 4)
        )
        max_active_queries_global = int(
            getattr(config, "max_active_queries_global", 200)
        )
        stop_consumed_on_register = False
        if current_task is not None:
            register_with_limits = getattr(
                self.session_manager,
                "register_active_query_task_with_limits",
                None,
            )
            if callable(register_with_limits):
                registration_status = register_with_limits(
                    user_id,
                    current_task,
                    turn_ref=turn_ref,
                    conversation_ref=message.payload.conversation_ref,
                    max_active_queries_per_user=max_active_queries_per_user,
                    max_active_queries_global=max_active_queries_global,
                )
                if registration_status == ACTIVE_QUERY_USER_LIMIT:
                    await self._send_error(
                        websocket,
                        turn_ref,
                        (
                            "Too many active queries for this user. "
                            "Wait for an existing query to finish or stop it."
                        ),
                    )
                    return
                if registration_status == ACTIVE_QUERY_GLOBAL_LIMIT:
                    await self._send_error(
                        websocket,
                        turn_ref,
                        "Backend query capacity is saturated. Please retry shortly.",
                    )
                    return
                stop_consumed_on_register = (
                    registration_status == ACTIVE_QUERY_STOP_CONSUMED
                )
            else:
                count_active_query_tasks = getattr(
                    self.session_manager,
                    "count_active_query_tasks",
                    None,
                )
                if callable(count_active_query_tasks):
                    user_active_queries = count_active_query_tasks(user_id)
                    global_active_queries = count_active_query_tasks()
                    if user_active_queries >= max_active_queries_per_user:
                        await self._send_error(
                            websocket,
                            turn_ref,
                            (
                                "Too many active queries for this user. "
                                "Wait for an existing query to finish or stop it."
                            ),
                        )
                        return
                    if global_active_queries >= max_active_queries_global:
                        await self._send_error(
                            websocket,
                            turn_ref,
                            "Backend query capacity is saturated. Please retry shortly.",
                        )
                        return
                stop_consumed_on_register = (
                    self.session_manager.register_active_query_task(
                        user_id,
                        current_task,
                        turn_ref=turn_ref,
                        conversation_ref=message.payload.conversation_ref,
                    )
                )
        if current_task is None:
            count_active_query_tasks = getattr(
                self.session_manager,
                "count_active_query_tasks",
                None,
            )
            if callable(count_active_query_tasks):
                user_active_queries = count_active_query_tasks(user_id)
                global_active_queries = count_active_query_tasks()
                if user_active_queries >= max_active_queries_per_user:
                    await self._send_error(
                        websocket,
                        turn_ref,
                        (
                            "Too many active queries for this user. "
                            "Wait for an existing query to finish or stop it."
                        ),
                    )
                    return
                if global_active_queries >= max_active_queries_global:
                    await self._send_error(
                        websocket,
                        turn_ref,
                        "Backend query capacity is saturated. Please retry shortly.",
                    )
                    return
        if stop_consumed_on_register:
            logger.info(
                "[Query Cancelled] Stop request consumed before query execution "
                "(user_id=%s, turn_ref=%s, conversation_ref=%s)",
                user_id,
                turn_ref,
                message.payload.conversation_ref,
            )
            return

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
        except asyncio.CancelledError:
            logger.info(
                "[Query Cancelled] Active query task cancelled "
                "(user_id=%s, turn_ref=%s, conversation_ref=%s)",
                user_id,
                turn_ref,
                message.payload.conversation_ref,
            )
            raise
        except ValidationError as e:
            await self._send_error(websocket, turn_ref, f"Invalid query: {e.message}")
        except Exception as e:
            # Full details logged server-side, sanitized message sent to client
            await self._send_error(websocket, turn_ref, None, exception=e)
        finally:
            if current_task is not None:
                self.session_manager.clear_active_query_task(user_id, current_task)

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
        await send_error_response(
            websocket,
            msg_id,
            message or "",
            exception=exception,
            user_facing=exception is None,
        )
