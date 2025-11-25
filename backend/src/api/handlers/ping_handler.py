"""
Ping Message Handler.

Handles ping/pong messages for WebSocket connection health checks.
"""
import logging
from typing import Any, Dict
from fastapi import WebSocket

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.schema import PingMessage
from backend.src.core.validation import validate_message, ValidationError

logger = logging.getLogger(__name__)


class PingMessageHandler(MessageHandler):
    """Handler for ping messages."""
    
    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate ping message structure."""
        try:
            validate_message(data, "ping", PingMessage)
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
        Handle a ping message.
        
        Args:
            data: Message data dictionary
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        try:
            validated = validate_message(data, "ping", PingMessage)
            await websocket.send_json({
                "type": "pong",
                "id": validated.id,
                "payload": {"text": validated.payload.get("text", "Pong")}
            })
        except ValidationError as e:
            await websocket.send_json({
                "type": "error",
                "id": data.get("id"),
                "payload": {"message": f"Invalid ping message: {e.message}"}
            })

