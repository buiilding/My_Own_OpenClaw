"""
Wakeword Message Handler.

Handles wakeword detection and activation messages.
"""
import logging
import random
from typing import Any, Dict

from fastapi import WebSocket

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.schema import WakewordDetectedMessage
from backend.src.core.config import AppConfig
from backend.src.core.validation import (
    validate_message,
    ValidationError
)

logger = logging.getLogger(__name__)


class WakewordHandler(MessageHandler):
    """
    Handler for wakeword detection and activation.
    
    When wakeword is detected:
    1. Enables voice mode and speech mode
    2. Sends a random greeting
    3. Prepares for continuous listening
    """

    def __init__(self, config: AppConfig):
        """
        Initialize the wakeword handler.
        
        Args:
            config: Application configuration instance
        """
        self.config = config

    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate wakeword message structure."""
        try:
            validate_message(data, "wakeword-detected", WakewordDetectedMessage)
            return True
        except ValidationError:
            return False

    async def handle(
        self, data: Dict[str, Any], websocket: WebSocket, user_id: str
    ) -> None:
        """
        Handle wakeword detection.
        
        Activates voice/speech modes and sends greeting.
        
        Args:
            data: Message data dictionary
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        try:
            # Validate message
            validated = validate_message(data, "wakeword-detected", WakewordDetectedMessage)
            msg_id = validated.id

            # Select random greeting
            greetings = self.config.wakeword_greetings
            greeting = random.choice(greetings) if greetings else "Hello! I'm listening."
            
            # Send wakeword activation response
            await websocket.send_json({
                "type": "wakeword-activated",
                "id": msg_id,
                "payload": {
                    "voice_mode_enabled": True,
                    "speech_mode_enabled": True,
                    "greeting": greeting,
                    "status": "listening"
                }
            })

            # Send greeting message for TTS
            await websocket.send_json({
                "type": "wakeword-greeting", 
                "id": msg_id,
                "payload": {
                    "text": greeting
                }
            })

            logger.info(f"Wakeword activated for user {user_id} with greeting: {greeting}")

        except ValidationError as e:
            await websocket.send_json({
                "type": "error",
                "id": data.get("id"),
                "payload": {"message": f"Invalid wakeword message: {e.message}"}
            })
        except Exception as e:
            logger.error(f"Error in wakeword handler: {e}", exc_info=True)
            await websocket.send_json({
                "type": "error", 
                "id": data.get("id"),
                "payload": {"message": f"Wakeword error: {str(e)}"}
            })


