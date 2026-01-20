"""
Query Message Handler.

Handles user query messages and streams responses back to the client.
"""
import logging
import time
from typing import TYPE_CHECKING, Any, Dict, Optional

from fastapi import WebSocketDisconnect

from backend.src.api.core.base import MessageHandler

if TYPE_CHECKING:
    from backend.src.agent.core.session_manager import SessionManager
from backend.src.api.core.errors import send_error_response, send_success_response
from backend.src.api.query.formatter import ResponseFormatter
from backend.src.api.query.pipeline import StreamPipeline
from backend.src.api.core.transport import WebSocketSender, WebSocketTransportSender
from backend.src.api.tts.manager import TTSManager
from backend.src.api.tts.processor import TTSProcessor
from backend.src.api.schema import BaseMessage, QueryMessage
from backend.src.core.validation import (
    ValidationError,
    validate_query_text,
)

logger = logging.getLogger(__name__)


class QueryMessageHandler(MessageHandler):
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
        self.tts_manager = tts_manager
        self.response_formatter = response_formatter

    def validate_message(self, message: BaseMessage) -> bool:
        """Validate query message structure."""
        return isinstance(message, QueryMessage)

    async def handle(
        self, message: BaseMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle a query message.

        Args:
            message: Validated QueryMessage Pydantic model
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        query_start_time = time.perf_counter()
        logger.info(f"[Timing] Query received from frontend (user_id={user_id})")
        tts_service = None
        audio_task = None

        # Type assertion - message is already validated as QueryMessage
        validated: QueryMessage = message  # type: ignore
        msg_id = validated.id

        try:
            # Validate and sanitize query text
            try:
                query_text = validate_query_text(validated.payload.text)
            except ValidationError as e:
                await self._send_error(websocket, msg_id, f"Invalid query: {e.message}")
                return

            # Get or create agent session
            agent_instance = await self.session_manager.get_or_create_session(user_id)

            # Initialize TTS if enabled in config
            tts_service = await self.tts_manager.initialize_if_enabled(
                agent_instance.cfg
            )
            if tts_service:
                audio_task = await self.tts_manager.start_streaming_task(
                    tts_service, websocket, msg_id
                )

            # Create pipeline
            # INVARIANT: One pipeline per query. Never reused.
            # This prevents accidental reuse bugs and keeps state isolated per query.
            transport = WebSocketTransportSender(websocket)
            tts_processor = TTSProcessor(self.tts_manager)
            pipeline = StreamPipeline(tts_processor, self.response_formatter, transport)

            # Process query and stream responses
            # Frontend now sends complete message content
            message_content = validated.payload.content
            screenshot = validated.payload.screenshot  # Optional screenshot data
            # Extract mode from payload
            mode = validated.payload.mode if hasattr(validated.payload, 'mode') else "agent"
            try:
                async for event in agent_instance.process_query(
                    query_text,
                    image_data=screenshot,
                    message_content=message_content,
                    mode=mode,  # Pass mode
                ):
                    # Process events through pipeline (msg_id passed per call, not stored)
                    await pipeline.process(event, tts_service, msg_id)

                # TTS STREAMING RACE FIX: Wait for all pending TTS tasks before flush
                # This ensures all TTS processing completes before inserting the end-of-stream
                # sentinel, preventing audio loss where the last chunk is cut off
                if tts_service:
                    await pipeline.wait_for_pending_tts()
                    await tts_service.flush()

                # Send final complete message using canonical utility
                await send_success_response(
                    websocket,
                    msg_id,
                    "streaming-complete",
                    {}
                )
                
                query_total_time = time.perf_counter() - query_start_time
                logger.info(f"[Timing] Query processing completed in {query_total_time:.3f}s (user_id={user_id})")

            except Exception as e:
                query_total_time = time.perf_counter() - query_start_time
                # Full details logged server-side, sanitized message sent to client
                await self._send_error(websocket, msg_id, None, exception=e)

        except Exception as e:
            # Catch any errors during setup (session creation, TTS initialization, etc.)
            # Full details logged server-side, sanitized message sent to client
            await self._send_error(websocket, msg_id, None, exception=e)
        
        finally:
            # DOUBLE CLEANUP FIX: Single cleanup point to prevent double-freeing resources
            # This ensures cleanup runs exactly once, regardless of where exceptions occur
            # (setup errors, processing errors, or normal completion)
            if audio_task and not audio_task.done():
                audio_task.cancel()
            await self.tts_manager.cleanup(tts_service, audio_task)

    async def _send_error(
        self, 
        websocket: WebSocketSender, 
        msg_id: Optional[str], 
        message: Optional[str] = None,
        exception: Optional[Exception] = None
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
