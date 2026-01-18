"""
Wakeword Message Handler.

Handles wakeword detection and activation messages.
"""
import logging
from typing import Any, Dict

from fastapi import WebSocketDisconnect

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.handlers.error_utils import send_error_response, send_success_response
from backend.src.api.handlers.transport import WebSocketSender
from backend.src.api.handlers.tts_manager import TTSManager
from backend.src.api.schema import BaseMessage, WakewordDetectedMessage
from backend.src.core.services.wakeword_service import WakewordService
from backend.src.core.validation import ValidationError

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

    def __init__(self, tts_manager: TTSManager, wakeword_service: WakewordService):
        """
        Initialize the wakeword handler.

        Args:
            tts_manager: TTS manager for text-to-speech handling
            wakeword_service: Wakeword service for greeting selection and activation logic
        """
        self.tts_manager = tts_manager
        self.wakeword_service = wakeword_service

    def validate_message(self, message: BaseMessage) -> bool:
        """Validate wakeword message structure."""
        return isinstance(message, WakewordDetectedMessage)

    async def handle(
        self, message: BaseMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle wakeword detection.

        Activates voice/speech modes, sends greeting, and generates TTS if enabled.

        Args:
            message: Validated WakewordDetectedMessage Pydantic model
            websocket: WebSocketSender (thread-safe protocol implementation)
            user_id: User ID from connection context
        """
        tts_service = None
        audio_task = None
        
        try:
            # Type assertion - message is already validated as WakewordDetectedMessage
            validated: WakewordDetectedMessage = message  # type: ignore
            msg_id = validated.id

            # Get greeting from service (policy extracted)
            greeting = self.wakeword_service.select_greeting()

            # Initialize TTS if speech mode is enabled
            # Get config from wakeword service (it has access to config)
            config = self.wakeword_service.config
            tts_service = await self.tts_manager.initialize_if_enabled(config)
            if tts_service:
                audio_task = await self.tts_manager.start_streaming_task(
                    tts_service, websocket, msg_id
                )

            # Send responses using canonical utilities
            activation_payload = self.wakeword_service.get_activation_payload(greeting)
            await send_success_response(
                websocket,
                msg_id,
                "wakeword-activated",
                activation_payload
            )

            await send_success_response(
                websocket,
                msg_id,
                "wakeword-greeting",
                {"text": greeting}
            )

            # Generate TTS for greeting if speech mode enabled
            if tts_service:
                await tts_service.process_text(greeting)
                await tts_service.flush()

            logger.info(f"Wakeword activated for user {user_id} with greeting: {greeting}")

        except ValidationError as e:
            # Validation error - send using canonical utility
            await send_error_response(
                websocket,
                message.id,
                f"Invalid wakeword message: {e.message}"
            )
        except Exception as e:
            # Unexpected error - send sanitized error to prevent information leakage
            await send_error_response(
                websocket,
                message.id,
                None,
                exception=e
            )
        finally:
            # Clean up TTS
            # Ensure audio_task is cancelled if handler task is cancelled
            if audio_task and not audio_task.done():
                audio_task.cancel()
            await self.tts_manager.cleanup(tts_service, audio_task)


