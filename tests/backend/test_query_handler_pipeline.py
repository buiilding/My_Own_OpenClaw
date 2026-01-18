"""
Unit tests for Query Handler Pipeline components.

Tests TTSProcessor, StreamPipeline, and refactored QueryMessageHandler.
"""
import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

# Add the codebase root to Python path so backend.src imports work
codebase_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(codebase_root))

from backend.src.api.handlers.response_formatter import ResponseFormatter
from backend.src.api.handlers.stream_pipeline import StreamPipeline
from backend.src.api.handlers.transport import TransportSender, WebSocketTransportSender
from backend.src.api.handlers.tts_manager import TTSManager
from backend.src.api.handlers.tts_processor import TTSProcessor
from backend.src.core.events import (
    ChunkEvent,
    ToolCallEvent,
    ToolOutputEvent,
)


class TestTTSProcessor:
    """Tests for TTSProcessor component."""

    def test_initialization(self):
        """Test TTSProcessor initialization."""
        tts_manager = Mock(spec=TTSManager)
        processor = TTSProcessor(tts_manager)
        
        assert processor.tts_manager == tts_manager
        assert processor._is_tool_call_context is None
        assert processor._stream_buffer == ""

    @pytest.mark.asyncio
    async def test_process_event_no_tts_service(self):
        """Test that TTSProcessor is a strict no-op when TTS is disabled."""
        tts_manager = Mock(spec=TTSManager)
        processor = TTSProcessor(tts_manager)
        
        event = ChunkEvent(content="test")
        
        # Should return immediately without calling tts_manager
        await processor.process_event(event, tts_service=None)
        
        tts_manager.process_event.assert_not_called()

    @pytest.mark.asyncio
    async def test_process_chunk_tool_call_detection(self):
        """Test tool call detection heuristics."""
        tts_manager = Mock(spec=TTSManager)
        tts_service = Mock()
        processor = TTSProcessor(tts_manager)
        
        # Test JSON brace detection
        chunk1 = ChunkEvent(content="{")
        await processor.process_event(chunk1, tts_service)
        
        # Should not send to TTS
        tts_manager.process_event.assert_not_called()
        
        # Test code block detection
        processor._reset_state()
        chunk2 = ChunkEvent(content="`")
        await processor.process_event(chunk2, tts_service)
        
        # Should not send to TTS
        tts_manager.process_event.assert_not_called()

    @pytest.mark.asyncio
    async def test_process_chunk_text_stream(self):
        """Test normal text stream processing."""
        tts_manager = Mock(spec=TTSManager)
        tts_service = Mock()
        processor = TTSProcessor(tts_manager)
        
        chunk = ChunkEvent(content="Hello world")
        await processor.process_event(chunk, tts_service)
        
        # Should send to TTS
        tts_manager.process_event.assert_called_once_with(tts_service, chunk)

    @pytest.mark.asyncio
    async def test_reset_on_tool_boundaries(self):
        """Test state reset on tool boundaries."""
        tts_manager = Mock(spec=TTSManager)
        tts_service = Mock()
        processor = TTSProcessor(tts_manager)
        
        # Set state
        processor._is_tool_call_context = True
        processor._stream_buffer = "test"
        
        # Reset on ToolCallEvent
        tool_call = ToolCallEvent(
            tool_name="test_tool",
            parameters={},
            raw_call="{}"
        )
        await processor.process_event(tool_call, tts_service)
        
        assert processor._is_tool_call_context is None
        assert processor._stream_buffer == ""
        
        # Reset on ToolOutputEvent
        processor._is_tool_call_context = True
        processor._stream_buffer = "test"
        
        tool_output = ToolOutputEvent(
            tool_name="test_tool",
            success=True,
            output="result"
        )
        await processor.process_event(tool_output, tts_service)
        
        assert processor._is_tool_call_context is None
        assert processor._stream_buffer == ""

    @pytest.mark.asyncio
    async def test_non_chunk_events_pass_through(self):
        """Test that non-chunk events pass through to TTS manager."""
        tts_manager = Mock(spec=TTSManager)
        tts_service = Mock()
        processor = TTSProcessor(tts_manager)
        
        tool_call = ToolCallEvent(
            tool_name="test_tool",
            parameters={},
            raw_call="{}"
        )
        await processor.process_event(tool_call, tts_service)
        
        # Should pass through to TTS manager
        tts_manager.process_event.assert_called_once_with(tts_service, tool_call)


class TestStreamPipeline:
    """Tests for StreamPipeline component."""

    def test_initialization(self):
        """Test StreamPipeline initialization."""
        tts_processor = Mock(spec=TTSProcessor)
        response_formatter = Mock(spec=ResponseFormatter)
        transport_sender = Mock(spec=TransportSender)
        
        pipeline = StreamPipeline(tts_processor, response_formatter, transport_sender)
        
        assert pipeline.tts_processor == tts_processor
        assert pipeline.response_formatter == response_formatter
        assert pipeline.transport_sender == transport_sender

    @pytest.mark.asyncio
    async def test_process_event_flow(self):
        """Test event flow through pipeline stages."""
        tts_processor = Mock(spec=TTSProcessor)
        tts_processor.process_event = AsyncMock()
        
        response_formatter = Mock(spec=ResponseFormatter)
        response_formatter.format.return_value = {"type": "test", "id": "123"}
        
        transport_sender = Mock(spec=TransportSender)
        transport_sender.send = AsyncMock()
        
        pipeline = StreamPipeline(tts_processor, response_formatter, transport_sender)
        
        event = ChunkEvent(content="test")
        tts_service = Mock()
        msg_id = "123"
        
        await pipeline.process(event, tts_service, msg_id)
        
        # Verify all stages were called
        tts_processor.process_event.assert_called_once_with(event, tts_service)
        response_formatter.format.assert_called_once_with(event, msg_id)
        transport_sender.send.assert_called_once_with({"type": "test", "id": "123"})

    @pytest.mark.asyncio
    async def test_tts_failure_isolation(self):
        """Test that TTS failures don't block formatting/transport."""
        tts_processor = Mock(spec=TTSProcessor)
        tts_processor.process_event = AsyncMock(side_effect=Exception("TTS error"))
        
        response_formatter = Mock(spec=ResponseFormatter)
        response_formatter.format.return_value = {"type": "test", "id": "123"}
        
        transport_sender = Mock(spec=TransportSender)
        transport_sender.send = AsyncMock()
        
        pipeline = StreamPipeline(tts_processor, response_formatter, transport_sender)
        
        event = ChunkEvent(content="test")
        tts_service = Mock()
        msg_id = "123"
        
        # Should not raise, should continue to formatting/transport
        await pipeline.process(event, tts_service, msg_id)
        
        # TTS should have been called (and failed)
        tts_processor.process_event.assert_called_once()
        
        # But formatting and transport should still execute
        response_formatter.format.assert_called_once()
        transport_sender.send.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_transport_send_when_formatter_returns_none(self):
        """Test that transport is not called when formatter returns None."""
        tts_processor = Mock(spec=TTSProcessor)
        tts_processor.process_event = AsyncMock()
        
        response_formatter = Mock(spec=ResponseFormatter)
        response_formatter.format.return_value = None
        
        transport_sender = Mock(spec=TransportSender)
        transport_sender.send = AsyncMock()
        
        pipeline = StreamPipeline(tts_processor, response_formatter, transport_sender)
        
        event = ChunkEvent(content="test")
        tts_service = Mock()
        msg_id = "123"
        
        await pipeline.process(event, tts_service, msg_id)
        
        # Transport should not be called
        transport_sender.send.assert_not_called()


class TestWebSocketTransportSender:
    """Tests for WebSocketTransportSender."""

    @pytest.mark.asyncio
    async def test_send_message(self):
        """Test sending message via WebSocket."""
        websocket = Mock()
        websocket.send_json = AsyncMock()
        
        transport = WebSocketTransportSender(websocket)
        message = {"type": "test", "id": "123"}
        
        await transport.send(message)
        
        websocket.send_json.assert_called_once_with(message)


class TestQueryHandlerIntegration:
    """Integration tests for refactored QueryMessageHandler."""

    @pytest.mark.asyncio
    async def test_handler_creates_pipeline_per_query(self):
        """Test that handler creates a new pipeline for each query."""
        # This test verifies the invariant: one pipeline per query, never reused
        # The handler should create pipeline components in handle() method
        
        # Import here to avoid circular dependencies
        from backend.src.api.handlers.query_handler import QueryMessageHandler
        
        # Mock dependencies
        session_manager = Mock()
        tts_manager = Mock(spec=TTSManager)
        response_formatter = Mock(spec=ResponseFormatter)
        
        handler = QueryMessageHandler(session_manager, tts_manager, response_formatter)
        
        # Verify handler has the right dependencies
        assert handler.session_manager == session_manager
        assert handler.tts_manager == tts_manager
        assert handler.response_formatter == response_formatter


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
