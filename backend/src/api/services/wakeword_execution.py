"""Wakeword activation execution service."""

from __future__ import annotations

import asyncio
import logging

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.infrastructure.errors import send_success_response
from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.schema import WakewordDetectedMessage
from backend.src.api.services.tts_session import TTSSession
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.core.services.wakeword_service import WakewordService

logger = logging.getLogger(__name__)


class WakewordExecutionService:
    """Encapsulates wakeword greeting + optional TTS flow."""

    def __init__(self, tts_manager: TTSManager, wakeword_service: WakewordService) -> None:
        self._tts_manager = tts_manager
        self._wakeword_service = wakeword_service

    async def execute(
        self,
        message: WakewordDetectedMessage,
        websocket: WebSocketSender,
        user_id: str,
    ) -> None:
        msg_id = message.id
        greeting = self._wakeword_service.select_greeting()

        async with TTSSession(
            self._tts_manager,
            self._wakeword_service.config,
            websocket,
            msg_id,
        ) as tts_session:
            await send_success_response(
                websocket,
                msg_id,
                OutgoingMessageType.WAKEWORD_ACTIVATED,
                self._wakeword_service.get_activation_payload(greeting),
            )

            await send_success_response(
                websocket,
                msg_id,
                OutgoingMessageType.WAKEWORD_GREETING,
                {"text": greeting},
            )

            if tts_session.service:
                await tts_session.service.process_text(greeting)
                await tts_session.service.flush()
                await tts_session.service.wait_until_finished(timeout=10.0)
                try:
                    await tts_session.wait_for_audio_completion(timeout=5.0)
                    logger.debug("Audio streaming task completed successfully")
                except asyncio.TimeoutError:
                    logger.warning(
                        "Audio streaming task timeout - may still be sending chunks"
                    )
                except Exception as e:
                    logger.debug(
                        "Audio streaming task error (expected on disconnect): %s",
                        e,
                    )

        logger.info("Wakeword activated for user %s with greeting: %s", user_id, greeting)
