"""
TTS Processor for Query Handler.

Processes events for TTS with tool call filtering to prevent tool call JSON
and code blocks from being spoken aloud.

ARCHITECTURAL NOTE:
This is a transitional component that compensates for missing event semantics
upstream. The heuristic detection (checking for '{' or '`') is a protocol smell
that should be eliminated when ChunkEvent gains metadata about content type
(e.g., ChunkEvent(kind="tool-json") or ChunkEvent(kind="code")).

Current behavior:
- Detects tool calls by checking if chunk starts with '{' (JSON) or '`' (code block)
- Buffers chunks until content type can be determined
- Filters tool call chunks from TTS (doesn't send to TTS service)
- Passes through normal text chunks to TTS

Future improvement:
- Replace heuristic detection with explicit event metadata
- Remove state machine when ChunkEvent includes content type information
"""
import logging
from typing import Optional

from backend.src.api.handlers.tts_manager import TTSManager
from backend.src.core.events import (
    AgentStreamingEvent,
    ChunkEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.core.services.tts_service import TTSService

logger = logging.getLogger(__name__)


class TTSProcessor:
    """
    Processes events for TTS with tool call filtering.
    
    Filters tool call JSON and code blocks from TTS output using heuristic
    detection. This prevents the LLM from speaking tool call syntax aloud.
    
    State Machine:
    - None: Unknown content type (buffering to detect)
    - False: Normal text (pass through to TTS)
    - True: Tool call/code (filter from TTS)
    
    The state resets on explicit tool boundaries (ToolCallEvent, ToolOutputEvent).
    
    Args:
        tts_manager: TTS manager for text-to-speech handling
    """
    
    def __init__(self, tts_manager: TTSManager):
        """
        Initialize the TTS processor.
        
        Args:
            tts_manager: TTS manager for text-to-speech handling
        """
        self.tts_manager = tts_manager
        self._is_tool_call_context = None  # State machine
        self._stream_buffer = ""
    
    async def process_event(
        self, 
        event: AgentStreamingEvent, 
        tts_service: Optional[TTSService]
    ) -> None:
        """
        Process an event for TTS with tool call filtering.
        
        Args:
            event: Agent streaming event
            tts_service: TTS service instance (may be None if TTS disabled)
        """
        # Strict no-op when TTS is disabled
        # TTSProcessor has exactly one responsibility: TTS
        # Formatter + transport already handle UI semantics
        if not tts_service:
            return
        
        # Reset state on explicit tool boundaries only
        # ThinkingEvent is a presentation concern, not a protocol boundary
        if isinstance(event, (ToolCallEvent, ToolOutputEvent)):
            self._reset_state()
        
        if isinstance(event, ChunkEvent):
            await self._process_chunk(event, tts_service)
        else:
            # Pass through non-chunk events
            await self.tts_manager.process_event(tts_service, event)
    
    async def _process_chunk(
        self, 
        chunk: ChunkEvent, 
        tts_service: TTSService
    ) -> None:
        """
        Process a chunk event with tool call detection.
        
        Uses heuristic detection to identify tool calls:
        - Chunks starting with '{' are treated as JSON (tool calls)
        - Chunks starting with '`' are treated as code blocks
        - All other chunks are treated as normal text
        
        Args:
            chunk: Chunk event to process
            tts_service: TTS service instance (guaranteed non-None)
            
        Note:
            This heuristic is imperfect but functional. It may incorrectly
            filter legitimate text that starts with these characters. The
            proper fix requires upstream changes to add content type metadata
            to ChunkEvent.
        """
        # TRANSITIONAL: Heuristic detection compensates for missing event metadata
        # TODO: Replace with ChunkEvent.kind metadata when available upstream
        if self._is_tool_call_context is None:
            # Unknown content type - buffer and detect
            self._stream_buffer += chunk.content
            stripped = self._stream_buffer.lstrip()
            
            if len(stripped) > 0:
                if stripped.startswith("{") or stripped.startswith("`"):
                    # Starts with JSON brace or code block -> likely tool call
                    self._is_tool_call_context = True
                    # Clear buffer to prevent memory accumulation of tool call content
                    # Do NOT send to TTS (filter tool calls from speech)
                    self._stream_buffer = ""
                else:
                    # Starts with normal text
                    self._is_tool_call_context = False
                    # Flush buffered text to TTS
                    await self.tts_manager.process_event(
                        tts_service, 
                        ChunkEvent(content=self._stream_buffer)
                    )
                    # Clear buffer after flushing
                    self._stream_buffer = ""
            # If still empty/whitespace, continue buffering
        
        elif self._is_tool_call_context is False:
            # Known text stream, pass through to TTS
            await self.tts_manager.process_event(tts_service, chunk)
        
        # If is_tool_call_context is True, drop chunks (don't send to TTS)
    
    def _reset_state(self) -> None:
        """Reset the state machine state."""
        self._is_tool_call_context = None
        self._stream_buffer = ""
