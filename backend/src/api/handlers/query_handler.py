"""
Query Message Handler.

Handles user query messages and streams responses back to the client.
"""
import logging
import time
from typing import TYPE_CHECKING, Any, Dict

from fastapi import WebSocket, WebSocketDisconnect

from backend.src.api.handlers.base import MessageHandler

if TYPE_CHECKING:
    from backend.src.agent.core.session_manager import SessionManager
from backend.src.api.handlers.response_formatter import ResponseFormatter
from backend.src.api.handlers.stream_pipeline import StreamPipeline
from backend.src.api.handlers.transport import WebSocketTransportSender
from backend.src.api.handlers.tts_manager import TTSManager
from backend.src.api.handlers.tts_processor import TTSProcessor
from backend.src.api.schema import QueryMessage
from backend.src.core.validation import (
    ValidationError,
    validate_message,
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

    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate query message structure."""
        try:
            validate_message(data, "query", QueryMessage)
            return True
        except ValidationError:
            return False

    async def handle(
        self, data: Dict[str, Any], websocket: WebSocket, user_id: str
    ) -> None:
        """
        Handle a query message.

        Args:
            data: Message data dictionary
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        query_start_time = time.perf_counter()
        logger.info(f"[Timing] Query received from frontend (user_id={user_id})")
        tts_service = None
        audio_task = None

        try:
            # Validate message
            validated = validate_message(data, "query", QueryMessage)
            msg_id = validated.id

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
            try:
                async for event in agent_instance.process_query(
                    query_text,
                    message_content=message_content,
                ):
                    # Process events through pipeline (msg_id passed per call, not stored)
                    await pipeline.process(event, tts_service, msg_id)

                # Flush TTS buffer
                if tts_service:
                    await tts_service.flush()

                # Send final complete message
                try:
                    await transport.send(
                        {"type": "streaming-complete", "id": msg_id, "payload": {}}
                    )
                except (WebSocketDisconnect, RuntimeError, ConnectionError) as send_error:
                    logger.debug(f"Failed to send streaming-complete to closed connection: {send_error}")
                
                query_total_time = time.perf_counter() - query_start_time
                logger.info(f"[Timing] Query processing completed in {query_total_time:.3f}s (user_id={user_id})")

            except Exception as e:
                query_total_time = time.perf_counter() - query_start_time
                logger.error(f"[Timing] Query processing failed after {query_total_time:.3f}s: {e}", exc_info=True)
                logger.error(f"Error in query processing: {e}", exc_info=True)
                await self._send_error(websocket, msg_id, str(e))
            finally:
                # Clean up TTS
                await self.tts_manager.cleanup(tts_service, audio_task)

        except ValidationError as e:
            await self._send_error(
                websocket, data.get("id"), f"Invalid query message: {e.message}"
            )
        except Exception as e:
            logger.error(f"Unexpected error in query handler: {e}", exc_info=True)
            await self._send_error(
                websocket, data.get("id"), f"Internal error: {str(e)}"
            )

    async def _send_error(self, websocket: WebSocket, msg_id: str | None, message: str):
        """
        Send error response.
        
        Handles connection errors gracefully - if connection is closed, logs and returns silently.
        
        Args:
            websocket: WebSocket connection
            msg_id: Message ID (optional)
            message: Error message
        """
        try:
            transport = WebSocketTransportSender(websocket)
            await transport.send({
                "type": "error",
                "id": msg_id,
                "payload": {"message": message}
            })
        except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
            # Connection closed - this is expected in some cases, log at debug level
            logger.debug(f"Failed to send error message to closed connection: {e}")
