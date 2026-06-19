"""Tests for API processing formatters."""
import pytest

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.api.processing.formatters.chunk import ChunkEventFormatter
from backend.src.api.processing.formatters.assistant_message import AssistantMessageFullEventFormatter
from backend.src.api.processing.formatters.complete import StreamingCompleteEventFormatter
from backend.src.api.processing.formatters.error import ErrorEventFormatter
from backend.src.api.processing.formatters.web_search_progress import WebSearchProgressEventFormatter
from backend.src.core.infrastructure.user_facing_errors import (
    INTERNAL_SERVER_ERROR_MESSAGE,
    OPENAI_RESPONSES_EMPTY_STREAM_MESSAGE,
)
from backend.src.api.processing.formatters.thinking import ThinkingEventFormatter
from backend.src.api.processing.formatters.tool_call import ToolCallEventFormatter
from backend.src.api.processing.formatters.tool_output import ToolOutputEventFormatter
from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ThinkingEvent,
    AssistantMessageFullEvent as AssistantMessageFullEventClass,
    ErrorEvent as ErrorEventClass,
    ToolCallEvent as ToolCallEventClass,
    ToolOutputEvent as ToolOutputEventClass,
    StreamingCompleteEvent as StreamingCompleteEventClass,
    WebSearchProgressEvent as WebSearchProgressEventClass,
)


class TestEventFormatterBase:
    """Tests for EventFormatter base class."""

    def test_get_required_field_returns_present_value(self):
        class TestFormatter(EventFormatter):
            def format(self, event, msg_id):
                return self._get_required_field("value", "field", "TestEvent", msg_id)
        
        formatter = TestFormatter()
        
        result = formatter.format(ChunkEvent(content="ignored"), "msg-123")
        
        assert result == "value"


class TestChunkEventFormatter:
    """Tests for ChunkEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return ChunkEventFormatter()

    def test_format_success(self, formatter):
        event = ChunkEvent(content="Hello world")
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "streaming-response",
            "id": msg_id,
            "payload": {"text": "Hello world"},
        }

    def test_format_with_none_content(self, formatter):
        event = ChunkEvent(content=None)
        msg_id = "msg-123"
        
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
        event = AssistantMessageFullEventClass(content="Full message")
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "assistant-message-full",
            "id": msg_id,
            "payload": {"content": "Full message"},
        }

    def test_format_with_none_content(self, formatter):
        event = AssistantMessageFullEventClass(content=None)
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result is None


class TestStreamingCompleteEventFormatter:
    """Tests for StreamingCompleteEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return StreamingCompleteEventFormatter()

    def test_format(self, formatter):
        event = StreamingCompleteEventClass(final_response="done")
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "streaming-complete",
            "id": msg_id,
            "payload": {"final_response": "done"},
        }

    def test_format_with_empty_event(self, formatter):
        result = formatter.format(StreamingCompleteEventClass(), "msg-123")
        
        assert result == {
            "type": "streaming-complete",
            "id": "msg-123",
            "payload": {},
        }

    def test_format_with_streaming_event_final_response(self, formatter):
        event = StreamingCompleteEventClass(final_response="typed done")

        result = formatter.format(event, "msg-456")

        assert result == {
            "type": "streaming-complete",
            "id": "msg-456",
            "payload": {"final_response": "typed done"},
        }


class TestErrorEventFormatter:
    """Tests for ErrorEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return ErrorEventFormatter()

    def test_format_with_content(self, formatter):
        event = ErrorEventClass(content="Error message")
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "error",
            "id": msg_id,
            "payload": {
                "message": INTERNAL_SERVER_ERROR_MESSAGE,
            },
        }

    def test_format_with_details(self, formatter):
        event = ErrorEventClass(content="Error message")
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result["payload"]["message"] == INTERNAL_SERVER_ERROR_MESSAGE
        assert "content" not in result["payload"]

    def test_format_with_empty_content(self, formatter):
        event = ErrorEventClass(content="")
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result["payload"]["message"] == INTERNAL_SERVER_ERROR_MESSAGE

    def test_format_preserves_rate_limit_message(self, formatter):
        event = ErrorEventClass(content="Rate limit exceeded. Please wait.")

        result = formatter.format(event, "msg-456")

        assert result["payload"]["message"] == "Rate limit exceeded. Please wait."

    def test_format_preserves_openai_responses_empty_stream_message(self, formatter):
        event = ErrorEventClass(content=OPENAI_RESPONSES_EMPTY_STREAM_MESSAGE)

        result = formatter.format(event, "msg-openai-empty")

        assert result["payload"]["message"] == OPENAI_RESPONSES_EMPTY_STREAM_MESSAGE

    def test_format_preserves_structured_metadata(self, formatter):
        event = ErrorEventClass(
            content="LLM error",
            metadata={
                "stream_failed": True,
                "partial_response_emitted": True,
                "discard_partial_response": True,
            },
        )

        result = formatter.format(event, "msg-789")

        assert result["payload"]["metadata"] == {
            "stream_failed": True,
            "partial_response_emitted": True,
            "discard_partial_response": True,
        }


class TestThinkingEventFormatter:
    """Tests for ThinkingEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return ThinkingEventFormatter()

    def test_format_success(self, formatter):
        event = ThinkingEvent(content="Thinking about...")
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "llm-thought",
            "id": msg_id,
            "payload": {"status": "Thinking about..."},
        }

    def test_format_with_none_content(self, formatter):
        event = ThinkingEvent(content=None)
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result is None


class TestToolCallEventFormatter:
    """Tests for ToolCallEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return ToolCallEventFormatter()

    def test_format_success(self, formatter):
        event = ToolCallEventClass(tool_name="read_file", parameters={"path": "/test.txt"})
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result == {
            "type": "tool-call",
            "id": msg_id,
            "payload": {
                "tool_name": "read_file",
                "parameters": {"path": "/test.txt"},
            },
        }

    def test_format_with_request_id(self, formatter):
        event = ToolCallEventClass(
            tool_name="read_file",
            parameters={"path": "/test.txt"},
            request_id="req-456",
        )
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result["payload"]["request_id"] == "req-456"

    def test_format_with_metadata(self, formatter):
        event = ToolCallEventClass(
            tool_name="click",
            parameters={"x": 100, "y": 200},
            metadata={"description": "Click button"},
        )
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result["payload"]["metadata"] == {"description": "Click button"}

    def test_format_missing_tool_name(self, formatter):
        event = ToolCallEventClass(tool_name=None, parameters={"path": "/test.txt"})
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result is None

    def test_format_missing_parameters(self, formatter):
        event = ToolCallEventClass(tool_name="read_file", parameters=None)
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result is None

    def test_format_empty_tool_name(self, formatter):
        event = ToolCallEventClass(tool_name="", parameters={"path": "/test.txt"})
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        
        assert result is None

    def test_format_empty_parameters(self, formatter):
        # Empty args object is valid for tools that have no required args.
        event = ToolCallEventClass(tool_name="read_file", parameters={})
        msg_id = "msg-123"
        
        result = formatter.format(event, msg_id)
        assert result == {
            "type": "tool-call",
            "id": msg_id,
            "payload": {
                "tool_name": "read_file",
                "parameters": {},
            },
        }

    def test_format_invalid_parameters_type(self, formatter):
        event = ToolCallEventClass(tool_name="read_file", parameters="not-a-dict")
        msg_id = "msg-123"

        result = formatter.format(event, msg_id)
        assert result is None


class TestWebSearchProgressEventFormatter:
    """Tests for WebSearchProgressEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return WebSearchProgressEventFormatter()

    def test_format_success(self, formatter):
        event = WebSearchProgressEventClass(
            text="Searched youtube.com",
            request_id="req-search-1",
            action_type="search",
            url="https://youtube.com/watch?v=1",
            query="quantivity",
        )

        result = formatter.format(event, "msg-search-1")

        assert result == {
            "type": "web-search-progress",
            "id": "msg-search-1",
            "payload": {
                "text": "Searched youtube.com",
                "request_id": "req-search-1",
                "action_type": "search",
                "query": "quantivity",
                "url": "https://youtube.com/watch?v=1",
                "pattern": None,
            },
        }

    def test_format_skips_blank_text(self, formatter):
        assert formatter.format(
            WebSearchProgressEventClass(text="   "),
            "msg-search-blank",
        ) is None


class TestToolOutputEventFormatter:
    """Tests for ToolOutputEventFormatter."""

    @pytest.fixture
    def formatter(self):
        return ToolOutputEventFormatter()

    def test_format_success(self, formatter):
        event = ToolOutputEventClass(
            tool_name="read_file",
            success=True,
            output="file contents",
            execution_time=0.12,
            metadata={"source": "sidecar"},
        )

        result = formatter.format(event, "msg-1")

        assert result == {
            "type": "tool-output",
            "id": "msg-1",
            "payload": {
                "tool_name": "read_file",
                "success": True,
                "execution_time": 0.12,
                "output": "file contents",
                "error": None,
                "screenshot": None,
                "metadata": {"source": "sidecar"},
            },
        }

    def test_format_success_with_typed_event(self, formatter):
        event = ToolOutputEventClass(
            tool_name="click",
            success=False,
            output="",
            error="Element not found",
            screenshot="artifact://shot-1",
        )

        result = formatter.format(event, "msg-2")

        assert result["payload"] == {
            "tool_name": "click",
            "success": False,
            "execution_time": None,
            "output": "",
            "error": "Element not found",
            "screenshot": "artifact://shot-1",
            "metadata": None,
        }

    def test_format_preserves_null_output_payload(self, formatter):
        event = ToolOutputEventClass(tool_name="noop", success=True, output=None)

        result = formatter.format(event, "msg-null")

        assert result["payload"]["output"] is None

    def test_format_preserves_metadata_request_id_for_sdk_renderer_correlation(self, formatter):
        event = ToolOutputEventClass(
            tool_name="read_file",
            success=True,
            output="ok",
            metadata={"request_id": "meta-corr-1", "origin": "sidecar"},
        )

        result = formatter.format(event, "msg-4")

        assert result["payload"]["metadata"] == {
            "request_id": "meta-corr-1",
            "origin": "sidecar",
        }

    @pytest.mark.parametrize(
        "event,missing_field",
        [
            (
                ToolOutputEventClass(tool_name=None, success=True, output="ok"),
                "tool_name",
            ),
            (
                ToolOutputEventClass(tool_name="read_file", success=None, output="ok"),
                "success",
            ),
        ],
    )
    def test_format_missing_required_fields_returns_none_and_logs_warning(
        self,
        formatter,
        caplog,
        event,
        missing_field,
    ):
        with caplog.at_level("WARNING"):
            result = formatter.format(event, "msg-3")

        assert result is None
        assert "ToolOutputEvent missing required fields" in caplog.text
        assert missing_field in caplog.text
