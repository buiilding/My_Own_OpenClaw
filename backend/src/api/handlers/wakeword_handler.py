"""
Wakeword Message Handler.

Handles wakeword detection and activation messages.
"""
import logging
import random
from typing import Any, Dict

from fastapi import WebSocket

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.handlers.tts_manager import TTSManager
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
    3. Generates TTS audio for greeting if speech mode enabled
    4. Prepares for continuous listening
    """

    def __init__(self, config: AppConfig):
        """
        Initialize the wakeword handler.

        Args:
            config: Application configuration instance
        """
        self.config = config
        self.tts_manager = TTSManager()

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

        Activates voice/speech modes, sends greeting, and generates TTS if enabled.

        Args:
            data: Message data dictionary
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        tts_service = None
        audio_task = None

        try:
            # Validate message
            validated = validate_message(data, "wakeword-detected", WakewordDetectedMessage)
            msg_id = validated.id

            # Select random greeting
            greetings = self.config.wakeword_greetings
            greeting = random.choice(greetings) if greetings else "Hello! I'm listening."

            # Initialize TTS if speech mode is enabled
            tts_service = await self.tts_manager.initialize_if_enabled(self.config)
            if tts_service:
                audio_task = await self.tts_manager.start_streaming_task(
                    tts_service, websocket, msg_id
                )

            # Send wakeword activation response
            await websocket.send_json({
                "type": "wakeword-activated",
                "id": msg_id,
                "payload": {
                    "voice_mode_enabled": True,
                    "speech_mode_enabled": self.config.speech_mode_enabled,
                    "greeting": greeting,
                    "status": "listening"
                }
            })

            # Send greeting message for display
            await websocket.send_json({
                "type": "wakeword-greeting",
                "id": msg_id,
                "payload": {
                    "text": greeting
                }
            })

            # Generate TTS for greeting if speech mode enabled
            if tts_service:
                await tts_service.process_text(greeting)
                await tts_service.flush()

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
        finally:
            # Clean up TTS
            await self.tts_manager.cleanup(tts_service, audio_task)


