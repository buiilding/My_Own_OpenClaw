"""
TTS Processor for Query Handler.

Processes events for TTS with tool call filtering to prevent tool call JSON
and code blocks from being spoken aloud.

ARCHITECTURAL NOTE:
This is a transitional component that compensates for missing event semantics
upstream. The heuristic detection (checking for '`') is a protocol smell
that should be eliminated when ChunkEvent gains metadata about content type
(e.g., ChunkEvent(kind="code")).

Current behavior:
- Detects code blocks by checking if chunk starts with '`' (code block marker)
- Buffers chunks until content type can be determined
- Filters code block chunks from TTS (doesn't send to TTS service)
- Passes through normal text chunks to TTS
- Tool call JSON suppression is handled by ToolCallEvent upstream (reliable)

CRITICAL FIX: Removed JSON ('{') detection to prevent "JSON trap" where
suppression never exits. JSON detection is too brittle without a parser.

Future improvement:
- Replace heuristic detection with explicit event metadata
- Remove state machine when ChunkEvent includes content type information
"""
import logging
from typing import Optional

from backend.src.api.tts.manager import TTSManager
from backend.src.core.events import (
    AgentStreamingEvent,
    ChunkEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.core.services.tts_service import TTSService

logger = logging.getLogger(__name__)

# Constants
MAX_BUFFER_SIZE = 4096  # 4KB - maximum buffer size to prevent unbounded memory growth during detection
# Increased from 1KB to handle larger tool call headers without leaking JSON to TTS


class TTSProcessor:
    """
    Processes events for TTS with code block filtering.
    
    Filters code blocks from TTS output using heuristic detection.
    Tool call JSON suppression is handled by ToolCallEvent upstream.
    
    State Machine:
    - None: Unknown content type (buffering to detect)
    - False: Normal text (pass through to TTS)
    - True: Code block (filter from TTS)
    
    The state resets on explicit tool boundaries (ToolCallEvent, ToolOutputEvent).
    
    CRITICAL FIX: Only detects code blocks (```), not JSON ({). JSON detection
    caused "JSON trap" where suppression never exits. ToolCallEvent handles
    tool call suppression reliably upstream.
    
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
        Process a chunk event with robust context switching.
        
        Handles chunks that contain both text and code/tool markers by recursively
        splitting and processing sub-chunks. This prevents:
        1. Data loss when code blocks end mid-chunk (text after ``` is preserved)
        2. Code leakage when code blocks start mid-chunk (text before ``` is sent, code is suppressed)
        
        Args:
            chunk: Chunk event to process
            tts_service: TTS service instance (guaranteed non-None)
        """
        content = chunk.content
        if not content:
            return
        
        # 1. IF SUPPRESSING (Tool/Code Context)
        if self._is_tool_call_context is True:
            # Look for exit marker (```) anywhere in the chunk
            exit_marker = "```"
            marker_idx = content.find(exit_marker)
            
            if marker_idx != -1:
                # CRITICAL FIX #1: Split at exit marker
                # Content before marker is suppressed (code), content after is text
                post_exit = content[marker_idx + len(exit_marker):]
                
                # Exit suppression state
                self._is_tool_call_context = False
                logger.debug("TTS: Code block exit detected, resuming audio output")
                
                # CRITICAL FIX #1: Process the text after the exit marker
                # This prevents data loss when code blocks end mid-chunk
                if post_exit:
                    await self._process_chunk(ChunkEvent(content=post_exit), tts_service)
                return
            else:
                # No exit marker, drop entire chunk (still in suppression)
                return
        
        # 2. IF BUFFERING (Indeterminate State)
        if self._is_tool_call_context is None:
            self._stream_buffer += content
            
            # Safety: Enforce buffer limit
            if len(self._stream_buffer) > MAX_BUFFER_SIZE:
                logger.warning(
                    f"TTS buffer exceeded limit ({MAX_BUFFER_SIZE} bytes), "
                    "forcing decision to treat as normal text"
                )
                self._is_tool_call_context = False
                await self.tts_manager.process_event(
                    tts_service,
                    ChunkEvent(content=self._stream_buffer)
                )
                self._stream_buffer = ""
                return
            
            stripped = self._stream_buffer.lstrip()
            if not stripped:
                # Still whitespace, keep buffering
                return
            
            # CRITICAL FIX #1: Only detect code blocks (```), NOT JSON ({)
            # JSON detection is too brittle - it causes "JSON trap" where suppression
            # never exits (JSON ends with '}', not '```'). ToolCallEvent upstream
            # handles tool call suppression reliably, so we don't need heuristic JSON detection.
            if stripped.startswith("`"):
                # Starts with code block marker
                self._is_tool_call_context = True
                self._stream_buffer = ""  # Drop buffer (contains code content)
            else:
                # Starts with text (including JSON-like text - let it speak)
                # If it's actual tool call JSON, ToolCallEvent will suppress it upstream
                self._is_tool_call_context = False
                # Flush buffered text
                await self.tts_manager.process_event(
                    tts_service,
                    ChunkEvent(content=self._stream_buffer)
                )
                self._stream_buffer = ""
            return
        
        # 3. IF TEXT MODE (Pass-through with scanning)
        elif self._is_tool_call_context is False:
            # CRITICAL FIX #2: Scan entire chunk for entry markers, not just startswith
            # This prevents code leakage when chunks contain "text\n```code"
            
            # Look for code block marker (```) anywhere in the chunk
            code_marker = "```"
            marker_idx = content.find(code_marker)
            
            if marker_idx != -1:
                # Found code block marker mid-chunk
                pre_marker = content[:marker_idx]
                post_marker = content[marker_idx:]
                
                # Send text before marker
                if pre_marker:
                    await self.tts_manager.process_event(
                        tts_service,
                        ChunkEvent(content=pre_marker)
                    )
                
                # Enter suppression state
                self._is_tool_call_context = True
                logger.debug("TTS: Code block entry detected mid-chunk, entering suppression")
                
                # CRITICAL FIX #2: Process the part after marker (may contain code or immediate exit)
                # This handles cases like "text\n```\nmore text" where exit is in same chunk
                if post_marker:
                    await self._process_chunk(ChunkEvent(content=post_marker), tts_service)
            else:
                # No markers found, pure text - pass through
                await self.tts_manager.process_event(tts_service, chunk)
    
    def _reset_state(self) -> None:
        """Reset the state machine state."""
        self._is_tool_call_context = None
        self._stream_buffer = ""
