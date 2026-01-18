"""
TTS Manager for Query Handler.

Manages TTS (Text-to-Speech) lifecycle during query processing.
"""
import asyncio
import logging
from typing import Any, Dict, Optional, Union

from fastapi import WebSocket, WebSocketDisconnect

from backend.src.core.config import AppConfig
from backend.src.core.events import StreamingEvent, ChunkEvent
from backend.src.core.services.tts_service import TTSService

logger = logging.getLogger(__name__)


class TTSManager:
    """
    Manages TTS initialization, streaming, and cleanup for query handlers.
    """

    async def initialize_if_enabled(self, config: AppConfig) -> Optional[TTSService]:
        """
        Initialize TTS service if enabled in config.

        Args:
            config: Application configuration

        Returns:
            TTSService instance if enabled, None otherwise
        """
        if config.speech_mode_enabled:
            tts_service = TTSService(config)
            await tts_service.initialize()
            return tts_service
        return None

    async def start_streaming_task(
        self, tts_service: TTSService, websocket: WebSocket, msg_id: str
    ) -> asyncio.Task:
        """
        Start background task to stream audio chunks to WebSocket.

        Args:
            tts_service: TTS service instance
            websocket: WebSocket connection
            msg_id: Message ID for responses

        Returns:
            Background task
        """
        return asyncio.create_task(self._stream_audio(tts_service, websocket, msg_id))

    async def process_event(
        self, tts_service: Optional[TTSService], event: Union[StreamingEvent, Dict[str, Any]]
    ) -> None:
        """
        Process an event for TTS (extract text chunks).

        Args:
            tts_service: TTS service instance (may be None)
            event: Event object (typed StreamingEvent or dict for backward compatibility)
        """
        if not tts_service:
            return
            
        # Use isinstance check for type safety
        if isinstance(event, ChunkEvent):
            await tts_service.process_text(event.content)
        elif isinstance(event, dict) and event.get("type") == "chunk":
            # Backward compatibility with dict events
            await tts_service.process_text(event.get("content", ""))

    async def cleanup(
        self, tts_service: Optional[TTSService], audio_task: Optional[asyncio.Task]
    ) -> None:
        """
        Clean up TTS service and audio streaming task.

        Args:
            tts_service: TTS service instance (may be None)
            audio_task: Audio streaming task (may be None)
        """
        if tts_service:
            # Flush any remaining TTS text and wait for processing
            await tts_service.flush()
            # Give TTS service time to finish processing remaining text
            # NOTE: This is a best-effort wait. The TTS service should handle
            # shutdown gracefully even if processing isn't complete.
            await asyncio.sleep(1.0)
            await tts_service.shutdown()

        if audio_task:
            # Wait for any remaining audio to be sent
            try:
                # Give it more time to finish streaming remaining chunks
                await asyncio.wait_for(audio_task, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                # Task already cancelled or timed out - ensure it's cancelled
                if not audio_task.done():
                    audio_task.cancel()
                # Wait briefly for cancellation to propagate
                try:
                    await asyncio.wait_for(audio_task, timeout=0.5)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    pass

    async def _stream_audio(
        self, tts_service: TTSService, websocket: WebSocket, msg_id: str
    ) -> None:
        """
        Stream audio chunks from TTS service to WebSocket.

        Args:
            tts_service: TTS service instance
            websocket: WebSocket connection
            msg_id: Message ID for responses
        """
        try:
            async for audio_chunk in tts_service.stream_audio():
                try:
                    await websocket.send_json(
                        {"type": "audio-chunk", "id": msg_id, "payload": audio_chunk}
                    )
                except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                    # Connection closed - stop streaming
                    logger.debug(f"TTS audio streaming stopped due to closed connection: {e}")
                    break
        except Exception as e:
            logger.error(f"Error streaming audio: {e}", exc_info=True)
