"""
Stream Pipeline for Query Handler.

Orchestrates event processing through composable stages.
"""
import logging
from typing import Optional

from backend.src.api.handlers.response_formatter import ResponseFormatter
from backend.src.api.handlers.transport import TransportSender
from backend.src.api.handlers.tts_processor import TTSProcessor
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
        
        IMPORTANT: This method must be awaited serially per query.
        Parallel calls are undefined and will break ordering guarantees.
        The pipeline owns ordering guarantees - do not attempt to parallelize.
        
        Args:
            event: Agent streaming event to process
            tts_service: TTS service instance (may be None if TTS disabled)
            msg_id: Message ID for response formatting
        """
        # Stage 1: TTS processing (with filtering)
        # Isolated: TTS failure should not block formatting/transport
        try:
            await self.tts_processor.process_event(event, tts_service)
        except Exception:
            # Log and continue - TTS failure should not kill stream
            # Preserves UI streaming, tool execution feedback, and system resilience
            logger.error("TTS processing failed, continuing stream", exc_info=True)
        
        # Stage 2: Format for transport (msg_id passed here, not stored on pipeline)
        response = self.response_formatter.format(event, msg_id)
        if response:
            # Stage 3: Send via transport
            await self.transport_sender.send(response)
