"""Tests for API processing formatters."""
import pytest
from unittest.mock import MagicMock, patch

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.api.processing.formatters.chunk import ChunkEventFormatter
from backend.src.api.processing.formatters.assistant_message import AssistantMessageFullEventFormatter
from backend.src.api.processing.formatters.complete import StreamingCompleteEventFormatter
from backend.src.api.processing.formatters.error import ErrorEventFormatter
from backend.src.api.processing.formatters.thinking import ThinkingEventFormatter
from backend.src.api.processing.formatters.tool_call import ToolCallEventFormatter
from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ThinkingEvent,
    AssistantMessageFullEvent as AssistantMessageFullEventClass,
    ErrorEvent as ErrorEventClass,
    ToolCallEvent as ToolCallEventClass,
    StreamingCompleteEvent as StreamingCompleteEventClass,
)


class TestEventFormatterBase:
    """Tests for EventFormatter base class."""

    def test_get_event_dict_with_dict(self):
        class TestFormatter(EventFormatter):
            def format(self, event, msg_id):
                return self._get_event_dict(event)
        
        formatter = TestFormatter()
        event_dict = {"key": "value"}
        
        result = formatter.format(event_dict, "msg-123")
        
        assert result == event_dict

    def test_get_event_dict_with_streaming_event(self):
        class TestFormatter(EventFormatter):
            def format(self, event, msg_id):
                return self._get_event_dict(event)
        
        formatter = TestFormatter()
        event = ChunkEvent(content="test content")
        
        result = formatter.format(event, "msg-123")
        
        assert result["type"] == "chunk"
        assert result["content"] == "test content"


class TestChunkEventFormatter:
    """Tests for ChunkEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return ChunkEventFormatter()

    def test_format_success(self, formatter):
        event = {"type": "chunk", "content": "Hello world"}
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "streaming-response",
            "id": msg_id,
            "payload": {"text": "Hello world"},
        }

    def test_format_with_none_content(self, formatter):
        event = {"type": "chunk", "content": None}
        msg_id = "msg-123"
        
        with patch.object(formatter, "_get_event_dict", return_value=event):
            result = formatter.format(event, msg_id)
        
        assert result is None

    def test_format_with_streaming_event(self, formatter):
        event = ChunkEvent(content="Streaming content")
        msg_id = "msg-456"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "streaming-response",
            "id": msg_id,
            "payload": {"text": "Streaming content"},
        }


class TestAssistantMessageFullEventFormatter:
    """Tests for AssistantMessageFullEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return AssistantMessageFullEventFormatter()

    def test_format_success(self, formatter):
        event = {"type": "assistant_message_full", "content": "Full message"}
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "assistant-message-full",
            "id": msg_id,
            "payload": {"content": "Full message"},
        }

    def test_format_with_none_content(self, formatter):
        event = {"type": "assistant_message_full", "content": None}
        msg_id = "msg-123"
        
        with patch.object(formatter, "_get_event_dict", return_value=event):
            result = formatter.format(event, msg_id)
        
        assert result is None


class TestStreamingCompleteEventFormatter:
    """Tests for StreamingCompleteEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return StreamingCompleteEventFormatter()

    def test_format(self, formatter):
        event = {"type": "complete"}
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "streaming-complete",
            "id": msg_id,
            "payload": {},
        }

    def test_format_with_empty_event(self, formatter):
        result = formatter.format({}, "msg-123")
        
        assert result == {
            "type": "streaming-complete",
            "id": "msg-123",
            "payload": {},
        }


class TestErrorEventFormatter:
    """Tests for ErrorEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return ErrorEventFormatter()

    def test_format_with_content(self, formatter):
        event = {"type": "error", "content": "Error message"}
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "error",
            "id": msg_id,
            "payload": {
                "message": "Error message",
                "content": None,
            },
        }

    def test_format_with_details(self, formatter):
        event = {"type": "error", "content": "Error message", "details": "Stack trace"}
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result["payload"]["message"] == "Error message"
        assert result["payload"]["content"] == "Stack trace"

    def test_format_with_empty_content(self, formatter):
        event = {"type": "error"}
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result["payload"]["message"] == "An unexpected error occurred"


class TestThinkingEventFormatter:
    """Tests for ThinkingEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return ThinkingEventFormatter()

    def test_format_success(self, formatter):
        event = {"type": "thinking", "content": "Thinking about..."}
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "llm-thought",
            "id": msg_id,
            "payload": {"status": "Thinking about..."},
        }

    def test_format_with_none_content(self, formatter):
        event = {"type": "thinking", "content": None}
        msg_id = "msg-123"
        
        with patch.object(formatter, "_get_event_dict", return_value=event):
            result = formatter.format(event, msg_id)
        
        assert result is None


class TestToolCallEventFormatter:
    """Tests for ToolCallEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return ToolCallEventFormatter()

    def test_format_success(self, formatter):
        event = {
            "type": "tool_call",
            "tool_name": "read_file",
            "parameters": {"path": "/test.txt"},
            "raw_call": '<read_file path="/test.txt"/>',
        }
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "tool-call",
            "id": msg_id,
            "payload": {
                "tool_name": "read_file",
                "parameters": {"path": "/test.txt"},
                "raw_call": '<read_file path="/test.txt"/>',
            },
        }

    def test_format_with_request_id(self, formatter):
        event = {
            "type": "tool_call",
            "tool_name": "read_file",
            "parameters": {"path": "/test.txt"},
            "raw_call": '<read_file path="/test.txt"/>',
            "request_id": "req-456",
        }
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result["payload"]["request_id"] == "req-456"

    def test_format_with_metadata(self, formatter):
        event = {
            "type": "tool_call",
            "tool_name": "click",
            "parameters": {"x": 100, "y": 200},
            "raw_call": '<click x="100" y="200"/>',
            "metadata": {"description": "Click button"},
        }
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result["payload"]["metadata"] == {"description": "Click button"}

    def test_format_missing_tool_name(self, formatter):
        event = {
            "type": "tool_call",
            "parameters": {"path": "/test.txt"},
            "raw_call": '<read_file path="/test.txt"/>',
        }
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result is None

    def test_format_missing_parameters(self, formatter):
        event = {
            "type": "tool_call",
            "tool_name": "read_file",
            "raw_call": '<read_file path="/test.txt"/>',
        }
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result is None

    def test_format_missing_raw_call(self, formatter):
        event = {
            "type": "tool_call",
            "tool_name": "read_file",
            "parameters": {"path": "/test.txt"},
        }
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result is None

    def test_format_empty_tool_name(self, formatter):
        event = {
            "type": "tool_call",
            "tool_name": "",
            "parameters": {"path": "/test.txt"},
            "raw_call": '<read_file path="/test.txt"/>',
        }
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result is None

    def test_format_empty_parameters(self, formatter):
        # Empty dict is falsy in Python, so it should be treated as missing
        event = {
            "type": "tool_call",
            "tool_name": "read_file",
            "parameters": {},
            "raw_call": '<read_file path="/test.txt"/>',
        }
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        # Empty dict is falsy, so parameters check fails
        assert result is None
