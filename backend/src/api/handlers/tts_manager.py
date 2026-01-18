"""
TTS Manager for Query Handler.

Manages TTS (Text-to-Speech) lifecycle during query processing.
"""
import asyncio
import logging
from typing import Any, Dict, Optional, Union

from backend.src.api.handlers.transport import WebSocketSender
from backend.src.core.config import AppConfig
from backend.src.core.events import StreamingEvent, ChunkEvent
from backend.src.core.services.tts_service import TTSService

logger = logging.getLogger(__name__)

# Constants
TTS_FLUSH_WAIT_TIME = 1.0  # Seconds to wait for TTS service to finish processing after flush
AUDIO_TASK_TIMEOUT = 5.0  # Seconds to wait for audio streaming task to complete
AUDIO_TASK_CANCELLATION_WAIT = 0.5  # Seconds to wait for audio task cancellation to propagate


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
        self, 
        tts_service: TTSService, 
        websocket: WebSocketSender,  # Fixes Point #7: Uses Protocol
        msg_id: str
    ) -> asyncio.Task:
        """
        Start background task to stream audio chunks to WebSocket.

        Args:
            tts_service: TTS service instance
            websocket: WebSocketSender (thread-safe protocol implementation)
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
            await asyncio.sleep(TTS_FLUSH_WAIT_TIME)
            await tts_service.shutdown()

        if audio_task:
            # Wait for any remaining audio to be sent
            try:
                # Give it more time to finish streaming remaining chunks
                await asyncio.wait_for(audio_task, timeout=AUDIO_TASK_TIMEOUT)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                # Task already cancelled or timed out - ensure it's cancelled
                if not audio_task.done():
                    audio_task.cancel()
                # Wait briefly for cancellation to propagate
                try:
                    await asyncio.wait_for(audio_task, timeout=AUDIO_TASK_CANCELLATION_WAIT)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    pass

    async def _stream_audio(
        self, tts_service: TTSService, websocket: WebSocketSender, msg_id: str
    ) -> None:
        """
        Stream audio chunks from TTS service to WebSocket.
        
        Fixes Point #1: Uses WebSocketSender protocol.
        Since SafeWebSocket implements this protocol using a Lock,
        this is now thread-safe relative to the main handler loop.

        Args:
            tts_service: TTS service instance
            websocket: WebSocketSender (thread-safe protocol implementation)
            msg_id: Message ID for responses
        """
        try:
            async for audio_chunk in tts_service.stream_audio():
                try:
                    await websocket.send_json(
                        {"type": "audio-chunk", "id": msg_id, "payload": audio_chunk}
                    )
                except (RuntimeError, ConnectionError):
                    # Protocol implementations raise these on disconnection
                    logger.debug("TTS streaming stopped: connection closed")
                    break
        except Exception as e:
            logger.error(f"Error streaming audio: {e}", exc_info=True)
