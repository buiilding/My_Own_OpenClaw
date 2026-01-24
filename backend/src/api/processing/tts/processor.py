"""
TTS Processor for Query Handler.

Processes events for TTS with tool call filtering to prevent tool call JSON
and code blocks from being spoken aloud.

ARCHITECTURAL NOTE:
This is a transitional component that compensates for missing event semantics
upstream. The heuristic detection (checking for '`' and '{') is a protocol smell
that should be eliminated when ChunkEvent gains metadata about content type
(e.g., ChunkEvent(kind="code")).

Current behavior:
- Detects code blocks by checking if chunk starts with '`' (code block marker)
- Detects JSON by checking if chunk starts with '{' (JSON object marker)
- Buffers chunks until content type can be determined
- Filters code block and JSON chunks from TTS (doesn't send to TTS service)
- Passes through normal text chunks to TTS
- Tool call JSON suppression is handled by ToolCallEvent upstream (reliable)

Future improvement:
- Replace heuristic detection with explicit event metadata
- Remove state machine when ChunkEvent includes content type information
"""
import logging
from typing import Optional

from backend.src.api.processing.tts.manager import TTSManager
from backend.src.core.events.streaming_events import (
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
    Processes events for TTS with code block and JSON filtering.
    
    Filters code blocks and JSON from TTS output using heuristic detection.
    Tool call JSON suppression is handled by ToolCallEvent upstream.
    
    State Machine:
    - None: Unknown content type (buffering to detect)
    - False: Normal text (pass through to TTS)
    - True: Code block or JSON (filter from TTS)
    
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
        self._suppression_type = None  # 'code' or 'json' when suppressing
        self._json_brace_depth = 0  # Track brace depth for JSON suppression
    
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
        
        # 1. IF SUPPRESSING (Tool/Code/JSON Context)
        if self._is_tool_call_context is True:
            if self._suppression_type == 'code':
                # Look for code block exit marker (```)
                code_exit_marker = "```"
                exit_idx = content.find(code_exit_marker)
                
                if exit_idx != -1:
                    # Split at exit marker
                    post_exit = content[exit_idx + len(code_exit_marker):]
                    
                    # Exit suppression state
                    self._is_tool_call_context = False
                    self._suppression_type = None
                    logger.debug("TTS: Code block exit detected, resuming audio output")
                    
                    # Process the text after the exit marker
                    if post_exit:
                        await self._process_chunk(ChunkEvent(content=post_exit), tts_service)
                    return
                else:
                    # No exit marker, drop entire chunk (still in suppression)
                    return
                    
            elif self._suppression_type == 'json':
                # Track brace depth to properly handle nested JSON
                # Process character by character to track depth accurately
                for i, char in enumerate(content):
                    if char == '{':
                        self._json_brace_depth += 1
                    elif char == '}':
                        self._json_brace_depth -= 1
                        if self._json_brace_depth == 0:
                            # JSON object complete, exit suppression
                            post_exit = content[i + 1:]
                            
                            # Exit suppression state
                            self._is_tool_call_context = False
                            self._suppression_type = None
                            self._json_brace_depth = 0
                            logger.debug("TTS: JSON exit detected (brace depth 0), resuming audio output")
                            
                            # Process the text after the closing brace
                            if post_exit:
                                await self._process_chunk(ChunkEvent(content=post_exit), tts_service)
                            return
                
                # No exit found, drop entire chunk (still in suppression)
                return
            else:
                # Unknown suppression type, reset state
                self._is_tool_call_context = False
                self._suppression_type = None
                self._json_brace_depth = 0
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
            
            # Detect code blocks (```) or JSON ({)
            if stripped.startswith("`"):
                # Starts with code block marker
                self._is_tool_call_context = True
                self._suppression_type = 'code'
                self._stream_buffer = ""  # Drop buffer (contains code content)
            elif stripped.startswith("{"):
                # Starts with JSON object marker
                self._is_tool_call_context = True
                self._suppression_type = 'json'
                self._json_brace_depth = 1  # We found the opening brace
                self._stream_buffer = ""  # Drop buffer (contains JSON content)
            else:
                # Starts with text
                self._is_tool_call_context = False
                self._suppression_type = None
                # Flush buffered text
                await self.tts_manager.process_event(
                    tts_service,
                    ChunkEvent(content=self._stream_buffer)
                )
                self._stream_buffer = ""
            return
        
        # 3. IF TEXT MODE (Pass-through with scanning)
        elif self._is_tool_call_context is False:
            # Scan entire chunk for entry markers, not just startswith
            # This prevents code/JSON leakage when chunks contain "text\n```code" or "text\n{json}"
            
            # Look for code block marker (```) or JSON marker ({) anywhere in the chunk
            code_marker = "```"
            json_marker = "{"
            
            code_marker_idx = content.find(code_marker)
            json_marker_idx = content.find(json_marker)
            
            # Determine which marker appears first (or if either appears)
            marker_idx = -1
            marker = None
            if code_marker_idx != -1 and json_marker_idx != -1:
                # Both found, use the earlier one
                if code_marker_idx < json_marker_idx:
                    marker_idx = code_marker_idx
                    marker = code_marker
                else:
                    marker_idx = json_marker_idx
                    marker = json_marker
            elif code_marker_idx != -1:
                marker_idx = code_marker_idx
                marker = code_marker
            elif json_marker_idx != -1:
                marker_idx = json_marker_idx
                marker = json_marker
            
            if marker_idx != -1:
                # Found marker mid-chunk
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
                if marker == code_marker:
                    self._suppression_type = 'code'
                    logger.debug("TTS: Code block entry detected mid-chunk, entering suppression")
                else:
                    self._suppression_type = 'json'
                    self._json_brace_depth = 1  # We found the opening brace
                    logger.debug("TTS: JSON entry detected mid-chunk, entering suppression")
                
                # Process the part after marker (may contain code/JSON or immediate exit)
                # This handles cases like "text\n```\nmore text" or "text\n{json}" where exit is in same chunk
                if post_marker:
                    await self._process_chunk(ChunkEvent(content=post_marker), tts_service)
            else:
                # No markers found, pure text - pass through
                await self.tts_manager.process_event(tts_service, chunk)
    
    def _reset_state(self) -> None:
        """Reset the state machine state."""
        self._is_tool_call_context = None
        self._stream_buffer = ""
        self._suppression_type = None
        self._json_brace_depth = 0

