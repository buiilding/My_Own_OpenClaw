"""
Query Message Handler.

Handles user query messages and streams responses back to the client.
"""
import logging
from typing import Any, Dict
from fastapi import WebSocket

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.schema import QueryMessage
from backend.src.api.deps import SessionManager
from backend.src.core.validation import validate_message, validate_query_text, ValidationError

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
            
            # Process query and stream responses
            try:
                async for event in agent_instance.process_query(query_text):
                    response = self._format_event_response(event, msg_id)
                    if response:
                        await websocket.send_json(response)
                
                # Send final complete message
                await websocket.send_json({
                    "type": "streaming-complete",
                    "id": msg_id,
                    "payload": {}
                })
            
            except Exception as e:
                logger.error(f"Error in query processing: {e}", exc_info=True)
                await self._send_error(websocket, msg_id, str(e))
        
        except ValidationError as e:
            await self._send_error(websocket, data.get("id"), f"Invalid query message: {e.message}")
        except Exception as e:
            logger.error(f"Unexpected error in query handler: {e}", exc_info=True)
            await self._send_error(websocket, data.get("id"), f"Internal error: {str(e)}")
    
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

