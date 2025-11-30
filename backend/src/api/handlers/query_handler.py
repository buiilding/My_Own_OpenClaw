"""
Query Message Handler.

Handles user query messages and streams responses back to the client.
"""
import logging
import asyncio
from typing import Any, Dict, Optional
from fastapi import WebSocket

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.schema import QueryMessage
from backend.src.api.deps import SessionManager
from backend.src.core.validation import validate_message, validate_query_text, ValidationError
from backend.src.core.services.tts_service import TTSService

logger = logging.getLogger(__name__)


class QueryMessageHandler(MessageHandler):
    """Handler for query messages."""
    
    def __init__(self, session_manager: SessionManager):
        """
        Initialize the query handler.
        
        Args:
            session_manager: Session manager instance
        """
        self.session_manager = session_manager
    
    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate query message structure."""
        try:
            validate_message(data, "query", QueryMessage)
            return True
        except ValidationError:
            return False
    
    async def handle(
        self, 
        data: Dict[str, Any], 
        websocket: WebSocket,
        user_id: str
    ) -> None:
        """
        Handle a query message.
        
        Args:
            data: Message data dictionary
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        tts_service: Optional[TTSService] = None
        audio_task: Optional[asyncio.Task] = None
        
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
            if agent_instance.cfg.speech_mode_enabled:
                tts_service = TTSService(agent_instance.cfg)
                await tts_service.initialize()
                # Start streaming task
                audio_task = asyncio.create_task(
                    self._stream_audio(tts_service, websocket, msg_id)
                )
            
            # Process query and stream responses
            try:
                async for event in agent_instance.process_query(query_text):
                    # Handle TTS
                    if tts_service and event.get("type") == "chunk":
                        await tts_service.process_text(event["content"])
                    
                    response = self._format_event_response(event, msg_id)
                    if response:
                        await websocket.send_json(response)
                
                # Flush TTS buffer
                if tts_service:
                    await tts_service.flush()
                
                # Send final complete message
                await websocket.send_json({
                    "type": "streaming-complete",
                    "id": msg_id,
                    "payload": {}
                })
            
            except Exception as e:
                logger.error(f"Error in query processing: {e}", exc_info=True)
                await self._send_error(websocket, msg_id, str(e))
            finally:
                # Clean up TTS
                if tts_service:
                    # Flush any remaining TTS text and wait for processing
                    await tts_service.flush()
                    # Give TTS service time to finish processing remaining text
                    await asyncio.sleep(1.0)
                    await tts_service.shutdown()
                if audio_task:
                    # Wait for any remaining audio to be sent
                    try:
                        # Give it more time to finish streaming remaining chunks
                        await asyncio.wait_for(audio_task, timeout=5.0)
                    except (asyncio.TimeoutError, asyncio.CancelledError):
                        audio_task.cancel()
        
        except ValidationError as e:
            await self._send_error(websocket, data.get("id"), f"Invalid query message: {e.message}")
        except Exception as e:
            logger.error(f"Unexpected error in query handler: {e}", exc_info=True)
            await self._send_error(websocket, data.get("id"), f"Internal error: {str(e)}")
    
    async def _stream_audio(
        self, 
        tts_service: TTSService, 
        websocket: WebSocket, 
        msg_id: str
    ):
        """Stream audio chunks from TTS service to WebSocket."""
        try:
            async for audio_chunk in tts_service.stream_audio():
                await websocket.send_json({
                    "type": "audio-chunk",
                    "id": msg_id,
                    "payload": audio_chunk
                })
        except Exception as e:
            logger.error(f"Error streaming audio: {e}", exc_info=True)

    def _format_event_response(self, event: Dict[str, Any], msg_id: str) -> Dict[str, Any] | None:
        """Format agent event into WebSocket response."""
        event_type = event.get("type")
        
        if event_type == "thinking":
            return {
                "type": "llm-thought",
                "id": msg_id,
                "payload": {"status": event["content"]}
            }
        elif event_type == "chunk":
            return {
                "type": "streaming-response",
                "id": msg_id,
                "payload": {"text": event["content"]}
            }
        elif event_type == "error":
            return {
                "type": "error",
                "id": msg_id,
                "payload": {"content": event.get("content", "Error")}
            }
        elif event_type == "streaming-complete":
            return {
                "type": "streaming-complete",
                "id": msg_id,
                "payload": {}
            }
        elif event_type == "tool_call":
            return {
                "type": "tool-call",
                "id": msg_id,
                "payload": {
                    "tool_name": event.get("tool_name"),
                    "parameters": event.get("parameters"),
                    "raw_call": event.get("raw_call"),
                }
            }
        elif event_type == "tool_output":
            return {
                "type": "tool-output",
                "id": msg_id,
                "payload": {
                    "tool_name": event.get("tool_name"),
                    "success": event.get("success"),
                    "execution_time": event.get("execution_time"),
                    "output": event.get("output"),
                    "error": event.get("error"),
                    "screenshot": event.get("screenshot")
                }
            }
        
        return None
    
    async def _send_error(self, websocket: WebSocket, msg_id: str | None, message: str):
        """Send error response."""
        await websocket.send_json({
            "type": "error",
            "id": msg_id,
            "payload": {"message": message}
        })
