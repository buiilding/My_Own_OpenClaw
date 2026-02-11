"""
Wakeword Message Handler.

Handles wakeword detection and activation messages.
"""

import logging

from backend.src.api.infrastructure.handler import TypedMessageHandler
from backend.src.api.infrastructure.errors import send_error_response
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.schema import WakewordDetectedMessage
from backend.src.api.services.wakeword_execution import WakewordExecutionService
from backend.src.core.services.wakeword_service import WakewordService
from backend.src.core.validation.validators import ValidationError

logger = logging.getLogger(__name__)


class WakewordHandler(TypedMessageHandler[WakewordDetectedMessage]):
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
        self.execution_service = WakewordExecutionService(tts_manager, wakeword_service)

    message_model = WakewordDetectedMessage

    async def handle_typed(
        self, message: WakewordDetectedMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle wakeword detection.

        Activates voice/speech modes, sends greeting, and generates TTS if enabled.

        Args:
            message: Validated WakewordDetectedMessage Pydantic model
            websocket: WebSocketSender (thread-safe protocol implementation)
            user_id: User ID from connection context
        """
        try:
            await self.execution_service.execute(message, websocket, user_id)

        except ValidationError as e:
            # Validation error - send using canonical utility
            await send_error_response(
                websocket, message.id, f"Invalid wakeword message: {e.message}"
            )
        except Exception as e:
            # Unexpected error - send sanitized error to prevent information leakage
            await send_error_response(websocket, message.id, None, exception=e)
        finally:
            # No-op: execution service owns TTS session cleanup.
            logger.debug("Wakeword handler execution finalized for user %s", user_id)
