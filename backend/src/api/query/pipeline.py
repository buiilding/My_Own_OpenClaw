"""
Stream Pipeline for Query Handler.

Orchestrates event processing through composable stages.
"""
import logging
from typing import Optional

from fastapi import WebSocketDisconnect

from backend.src.api.query.formatter import ResponseFormatter
from backend.src.api.core.transport import TransportSender
from backend.src.api.tts.processor import TTSProcessor
from backend.src.core.events import AgentStreamingEvent
from backend.src.core.services.tts_service import TTSService

logger = logging.getLogger(__name__)


class StreamPipeline:
    """
    Linear event processing pipeline.
    
    IMPORTANT: StreamPipeline must remain stateless.
    All per-stream state lives in processors (e.g., TTSProcessor).
    
    Why this matters:
    - Pipelines that grow state turn into god objects
    - Debugging streaming systems with hidden pipeline state is miserable
    - This design keeps the pipeline as stateless glue between components
    """
    
    def __init__(
        self,
        tts_processor: TTSProcessor,
        response_formatter: ResponseFormatter,
        transport_sender: TransportSender,
    ):
        """
        Initialize the stream pipeline.
        
        Args:
            tts_processor: TTS processor for audio filtering
            response_formatter: Response formatter for WebSocket messages
            transport_sender: Transport sender for sending messages
        """
        self.tts_processor = tts_processor
        self.response_formatter = response_formatter
        self.transport_sender = transport_sender
        # NOTE: msg_id is NOT stored here - it's a transport-level concern
        # Pushed down to formatter.format() call to keep pipeline focused on event flow
    
    async def process(
        self, 
        event: AgentStreamingEvent, 
        tts_service: Optional[TTSService],
        msg_id: str
    ) -> None:
        """
        Process a single event through the pipeline stages.
        
        LATENCY OPTIMIZATION: TTS processing is decoupled from text response.
        Text is sent immediately to the frontend, while TTS processing runs
        concurrently. This prevents TTS buffering/lag from blocking text display.
        
        IMPORTANT: This method must be awaited serially per query.
        Parallel calls are undefined and will break ordering guarantees.
        The pipeline owns ordering guarantees - do not attempt to parallelize.
        
        Args:
            event: Agent streaming event to process
            tts_service: TTS service instance (may be None if TTS disabled)
            msg_id: Message ID for response formatting
        """
        # Stage 1: Format and send text immediately (don't wait for TTS)
        # This ensures text appears on screen instantly, improving perceived latency
        response = self.response_formatter.format(event, msg_id)
        if response:
            # Stage 2: Send via transport (text response sent first)
            # If connection is closed, log and re-raise to allow query handler to stop streaming
            try:
                await self.transport_sender.send(response)
            except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                # Connection closed - log and re-raise to stop streaming
                # Query handler will catch and handle appropriately
                logger.debug(f"Transport send failed (connection closed), stopping stream: {e}")
                raise
        
        # Stage 3: TTS processing (runs concurrently, doesn't block text)
        # Fork TTS processing into background task to avoid blocking text response
        # Isolated: TTS failure should not block formatting/transport
        import asyncio
        if tts_service:
            # Create background task for TTS (fire and forget)
            # Errors are logged but don't affect text streaming
            async def tts_task():
                try:
                    await self.tts_processor.process_event(event, tts_service)
                except Exception:
                    # Log and continue - TTS failure should not kill stream
                    # Preserves UI streaming, tool execution feedback, and system resilience
                    logger.error("TTS processing failed, continuing stream", exc_info=True)
            
            # Schedule TTS task to run concurrently (don't await)
            # This allows text to stream immediately while audio is generated
            asyncio.create_task(tts_task())