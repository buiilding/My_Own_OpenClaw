"""Tests for event system."""
import time
import pytest

from backend.src.core.events.base import Event
from backend.src.core.events.bus_events import ConfigChanged, InteractionCompleted
from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ThinkingEvent,
    ErrorEvent,
    StreamingCompleteEvent,
    ToolCallEvent,
    ToolOutputEvent,
    AssistantMessageFullEvent,
    TokenCountEvent,
    MemoryStoreEvent,
)
from backend.src.core.config.models import AppConfig


class TestEventBase:
    """Tests for Event base class."""

    def test_init_with_default_timestamp(self):
        before = time.time()
        event = Event()
        after = time.time()
        
        assert before <= event.timestamp <= after

    def test_init_with_custom_timestamp(self):
        custom_time = 1234567890.0
        event = Event(timestamp=custom_time)
        
        assert event.timestamp == custom_time


class TestInteractionCompleted:
    """Tests for InteractionCompleted event."""

    def test_init(self):
        event = InteractionCompleted(
            session_id="session-123",
            user_id="user-456",
            user_message="Hello",
            assistant_response="Hi there!"
        )
        
        assert event.session_id == "session-123"
        assert event.user_id == "user-456"
        assert event.user_message == "Hello"
        assert event.assistant_response == "Hi there!"
        assert event.timestamp is not None

    def test_inherits_from_event(self):
        event = InteractionCompleted(
            session_id="session-123",
            user_id="user-456",
            user_message="Hello",
            assistant_response="Hi there!"
        )
        
        assert isinstance(event, Event)


class TestConfigChanged:
    """Tests for ConfigChanged event."""

    def test_init(self):
        old_config = AppConfig(model_provider="openai")
        new_config = AppConfig(model_provider="anthropic")
        
        event = ConfigChanged(old_config=old_config, new_config=new_config)
        
        assert event.old_config == old_config
        assert event.new_config == new_config
        assert event.timestamp is not None

    def test_inherits_from_event(self):
        old_config = AppConfig()
        new_config = AppConfig()
        
        event = ConfigChanged(old_config=old_config, new_config=new_config)
        
        assert isinstance(event, Event)


class TestChunkEvent:
    """Tests for ChunkEvent."""

    def test_init(self):
        event = ChunkEvent(content="Hello world")
        
        assert event.content == "Hello world"
        assert event.type.value == "chunk"

    def test_to_dict(self):
        event = ChunkEvent(content="Hello world")
        result = event.to_dict()
        
        assert result == {"type": "chunk", "content": "Hello world"}


class TestThinkingEvent:
    """Tests for ThinkingEvent."""

    def test_init(self):
        event = ThinkingEvent(content="Thinking...")
        
        assert event.content == "Thinking..."
        assert event.type.value == "thinking"

    def test_to_dict(self):
        event = ThinkingEvent(content="Analyzing...")
        result = event.to_dict()
        
        assert result == {"type": "thinking", "content": "Analyzing..."}


class TestErrorEvent:
    """Tests for ErrorEvent."""

    def test_init(self):
        event = ErrorEvent(content="Something went wrong")
        
        assert event.content == "Something went wrong"
        assert event.type.value == "error"

    def test_to_dict(self):
        event = ErrorEvent(content="Error message")
        result = event.to_dict()
        
        assert result == {"type": "error", "content": "Error message"}


class TestStreamingCompleteEvent:
    """Tests for StreamingCompleteEvent."""

    def test_init_with_default(self):
        event = StreamingCompleteEvent()
        
        assert event.final_response is None
        assert event.type.value == "streaming-complete"

    def test_init_with_final_response(self):
        event = StreamingCompleteEvent(final_response="Final text")
        
        assert event.final_response == "Final text"

    def test_to_dict_without_response(self):
        event = StreamingCompleteEvent()
        result = event.to_dict()
        
        assert result == {"type": "streaming-complete"}

    def test_to_dict_with_response(self):
        event = StreamingCompleteEvent(final_response="Final text")
        result = event.to_dict()
        
        assert result == {"type": "streaming-complete", "final_response": "Final text"}


class TestToolCallEvent:
    """Tests for ToolCallEvent."""

    def test_init_required_fields(self):
        event = ToolCallEvent(
            tool_name="read_file",
            parameters={"path": "/test.txt"},
        )
        
        assert event.tool_name == "read_file"
        assert event.parameters == {"path": "/test.txt"}
        assert event.request_id is None
        assert event.metadata is None
        assert event.type.value == "tool_call"

    def test_init_with_optional_fields(self):
        event = ToolCallEvent(
            tool_name="click",
            parameters={"x": 100, "y": 200},
            request_id="req-123",
            metadata={"description": "Click button"}
        )
        
        assert event.request_id == "req-123"
        assert event.metadata == {"description": "Click button"}

    def test_to_dict(self):
        event = ToolCallEvent(
            tool_name="read_file",
            parameters={"path": "/test.txt"},
        )
        result = event.to_dict()
        
        assert result["type"] == "tool_call"
        assert result["tool_name"] == "read_file"
        assert result["parameters"] == {"path": "/test.txt"}


class TestToolOutputEvent:
    """Tests for ToolOutputEvent."""

    def test_init_required_fields(self):
        event = ToolOutputEvent(
            tool_name="read_file",
            success=True,
            output="file contents"
        )
        
        assert event.tool_name == "read_file"
        assert event.success is True
        assert event.output == "file contents"
        assert event.execution_time is None
        assert event.error is None
        assert event.screenshot is None
        assert event.metadata is None

    def test_init_with_optional_fields(self):
        event = ToolOutputEvent(
            tool_name="read_file",
            success=False,
            output="",
            execution_time=1.5,
            error="File not found",
            screenshot="base64data",
            metadata={"size": 1024}
        )
        
        assert event.execution_time == 1.5
        assert event.error == "File not found"
        assert event.screenshot == "base64data"
        assert event.metadata == {"size": 1024}

    def test_to_dict(self):
        event = ToolOutputEvent(
            tool_name="read_file",
            success=True,
            output="contents"
        )
        result = event.to_dict()
        
        assert result["type"] == "tool_output"
        assert result["tool_name"] == "read_file"
        assert result["success"] is True
        assert result["output"] == "contents"


class TestAssistantMessageFullEvent:
    """Tests for AssistantMessageFullEvent."""

    def test_init(self):
        event = AssistantMessageFullEvent(content="Full response")
        
        assert event.content == "Full response"
        assert event.type.value == "assistant_message_full"

    def test_to_dict(self):
        event = AssistantMessageFullEvent(content="Full response")
        result = event.to_dict()
        
        assert result == {"type": "assistant_message_full", "content": "Full response"}


class TestTokenCountEvent:
    """Tests for TokenCountEvent."""

    def test_init(self):
        event = TokenCountEvent(
            prompt_tokens=100,
            visible_output_tokens=38,
            thinking_tokens=12,
            output_tokens_total=50,
            total_tokens=150,
            conversation_tokens=1000,
            usage_source="provider",
        )
        
        assert event.prompt_tokens == 100
        assert event.visible_output_tokens == 38
        assert event.thinking_tokens == 12
        assert event.output_tokens_total == 50
        assert event.total_tokens == 150
        assert event.conversation_tokens == 1000
        assert event.usage_source == "provider"
        assert event.type.value == "token_count"

    def test_to_dict(self):
        event = TokenCountEvent(
            prompt_tokens=100,
            visible_output_tokens=50,
            thinking_tokens=None,
            output_tokens_total=50,
            total_tokens=150,
            conversation_tokens=1000,
            usage_source="estimated",
        )
        result = event.to_dict()
        
        assert result["type"] == "token_count"
        assert result["prompt_tokens"] == 100
        assert result["visible_output_tokens"] == 50
        assert result["thinking_tokens"] is None
        assert result["output_tokens_total"] == 50
        assert result["total_tokens"] == 150
        assert result["conversation_tokens"] == 1000
        assert result["usage_source"] == "estimated"


class TestMemoryStoreEvent:
    """Tests for MemoryStoreEvent."""

    def test_init_required_fields(self):
        event = MemoryStoreEvent(
            user_query="What is Python?",
            assistant_response="Python is a programming language.",
            memory_type="episodic"
        )
        
        assert event.user_query == "What is Python?"
        assert event.assistant_response == "Python is a programming language."
        assert event.memory_type == "episodic"
        assert event.user_id == "default_user"
        assert event.session_id is None

    def test_init_with_optional_fields(self):
        event = MemoryStoreEvent(
            user_query="Hello",
            assistant_response="Hi!",
            memory_type="semantic",
            user_id="user-123",
            session_id="session-456"
        )
        
        assert event.user_id == "user-123"
        assert event.session_id == "session-456"

    def test_to_dict(self):
        event = MemoryStoreEvent(
            user_query="Hello",
            assistant_response="Hi!",
            memory_type="episodic"
        )
        result = event.to_dict()
        
        assert result["type"] == "memory-store"
        assert result["user_query"] == "Hello"
        assert result["assistant_response"] == "Hi!"
        assert result["memory_type"] == "episodic"


class TestStreamingEventToDict:
    """Tests for StreamingEvent.to_dict base method."""

    def test_handles_nested_dict(self):
        event = ToolCallEvent(
            tool_name="test",
            parameters={"nested": {"key": "value"}},
        )
        result = event.to_dict()
        
        assert result["parameters"] == {"nested": {"key": "value"}}

    def test_handles_list(self):
        event = ToolOutputEvent(
            tool_name="test",
            success=True,
            output="test",
            metadata={"items": [1, 2, 3]}
        )
        result = event.to_dict()
        
        assert result["metadata"]["items"] == [1, 2, 3]
