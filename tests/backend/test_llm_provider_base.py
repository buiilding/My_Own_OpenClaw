"""Tests for LLMProvider base class."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.src.llm.providers.base import LLMProvider
from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    StreamingCompleteEvent,
)


class MockProvider(LLMProvider):
    """Mock implementation of LLMProvider for testing."""
    
    def _validate_dependencies(self) -> None:
        pass
    
    async def get_completion(self, model, messages):
        return {"content": "test", "tool_calls": None}
    
    async def _stream_internal(self, model, messages):
        yield ChunkEvent(content="Hello")
        yield StreamingCompleteEvent()
    
    async def list_models(self):
        return [{"id": "model1", "provider": "mock", "display_name": "Model 1"}]
    
    def _get_full_model_string(self, model_id: str) -> str:
        return f"mock/{model_id}"


class TestLLMProvider:
    """Tests for LLMProvider base class."""

    def test_init_with_defaults(self):
        provider = MockProvider()
        
        assert provider.api_key is None
        assert provider.base_url is None
        assert provider.timeout == 60.0

    def test_init_with_custom_values(self):
        provider = MockProvider(
            api_key="test-key",
            base_url="https://api.test.com",
            timeout=30.0
        )
        
        assert provider.api_key == "test-key"
        assert provider.base_url == "https://api.test.com"
        assert provider.timeout == 30.0

    def test_validate_dependencies_called(self):
        """Test that _validate_dependencies is called during init."""
        with patch.object(MockProvider, '_validate_dependencies') as mock_validate:
            MockProvider()
            mock_validate.assert_called_once()


class TestBuildRequestParams:
    """Tests for _build_request_params method."""

    @pytest.fixture
    def provider(self):
        return MockProvider(api_key="test-key", base_url="https://api.test.com")

    def test_build_with_valid_model(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        params = provider._build_request_params("gpt-4", messages)
        
        assert params["model"] == "mock/gpt-4"
        assert params["messages"] is messages
        assert params["api_key"] == "test-key"
        assert params["base_url"] == "https://api.test.com"
        assert params["timeout"] == 60.0

    def test_build_with_custom_model_string(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        params = provider._build_request_params("gpt-4", messages, model_string="custom/model")
        
        assert params["model"] == "custom/model"

    def test_build_raises_on_none_model(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        
        with pytest.raises(ValueError, match="model parameter cannot be None"):
            provider._build_request_params(None, messages)

    def test_build_raises_on_empty_string_model(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        
        with pytest.raises(ValueError, match="model parameter cannot be empty"):
            provider._build_request_params("", messages)

    def test_build_raises_on_whitespace_model(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        
        with pytest.raises(ValueError, match="model parameter cannot be empty"):
            provider._build_request_params("   ", messages)

    def test_build_raises_on_non_string_model(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        
        with pytest.raises(TypeError, match="model must be str"):
            provider._build_request_params(123, messages)


class TestExtractThinkingContent:
    """Tests for _extract_thinking_content method."""

    @pytest.fixture
    def provider(self):
        return MockProvider()

    def test_extract_from_object_reasoning_content(self, provider):
        delta = MagicMock()
        delta.reasoning_content = "This is reasoning"
        
        result = provider._extract_thinking_content(delta)
        
        assert result == "This is reasoning"

    def test_extract_from_object_thinking(self, provider):
        delta = MagicMock()
        delta.reasoning_content = None
        delta.thinking = "This is thinking"
        
        result = provider._extract_thinking_content(delta)
        
        assert result == "This is thinking"

    def test_extract_from_object_reasoning(self, provider):
        delta = MagicMock()
        delta.reasoning_content = None
        delta.thinking = None
        delta.reasoning = "This is reasoning"
        
        result = provider._extract_thinking_content(delta)
        
        assert result == "This is reasoning"

    def test_extract_from_object_thought(self, provider):
        delta = MagicMock()
        delta.reasoning_content = None
        delta.thinking = None
        delta.reasoning = None
        delta.thought = "This is a thought"
        
        result = provider._extract_thinking_content(delta)
        
        assert result == "This is a thought"

    def test_extract_from_dict(self, provider):
        delta = {"reasoning_content": "Dict reasoning"}
        
        result = provider._extract_thinking_content(delta)
        
        assert result == "Dict reasoning"

    def test_extract_from_dict_thinking_key(self, provider):
        delta = {"thinking": "Dict thinking"}
        
        result = provider._extract_thinking_content(delta)
        
        assert result == "Dict thinking"

    def test_extract_xml_thinking_tags(self, provider):
        delta = {"thinking": "<thinking>XML content</thinking>"}
        
        result = provider._extract_thinking_content(delta)
        
        assert result == "XML content"

    def test_extract_xml_multiline(self, provider):
        delta = {"thinking": "<thinking>Line 1\nLine 2\nLine 3</thinking>"}
        
        result = provider._extract_thinking_content(delta)
        
        assert result == "Line 1\nLine 2\nLine 3"

    def test_extract_from_dict_text_field(self, provider):
        delta = {"reasoning_content": {"text": "Nested text"}}
        
        result = provider._extract_thinking_content(delta)
        
        assert result == "Nested text"

    def test_extract_from_dict_content_field(self, provider):
        delta = {"reasoning_content": {"content": "Nested content"}}

        result = provider._extract_thinking_content(delta)

        assert result == "Nested content"

    def test_extract_from_dict_non_string_nested_value_returns_none(self, provider):
        delta = {"reasoning_content": {"text": 123}}

        result = provider._extract_thinking_content(delta)

        assert result is None

    def test_extract_plain_string_without_tags(self, provider):
        delta = {"thinking": "plain thinking text"}

        result = provider._extract_thinking_content(delta)

        assert result == "plain thinking text"

    def test_extract_no_content_returns_none(self, provider):
        delta = MagicMock()
        delta.reasoning_content = None
        delta.thinking = None
        delta.reasoning = None
        delta.thought = None
        
        result = provider._extract_thinking_content(delta)
        
        assert result is None

    def test_extract_empty_dict_returns_none(self, provider):
        result = provider._extract_thinking_content({})
        
        assert result is None


class TestGetCompletionStream:
    """Tests for get_completion_stream method."""

    @pytest.fixture
    def provider(self):
        return MockProvider()

    @pytest.mark.asyncio
    async def test_stream_yields_events(self, provider):
        events = []
        async for event in provider.get_completion_stream("model", []):
            events.append(event)
        
        assert len(events) == 2
        assert isinstance(events[0], ChunkEvent)
        assert isinstance(events[1], StreamingCompleteEvent)

    @pytest.mark.asyncio
    async def test_stream_handles_rate_limit_error(self):
        """Test that rate limit errors are converted to ErrorEvent."""
        import litellm
        
        class ErrorProvider(MockProvider):
            async def _stream_internal(self, model, messages):
                # Must raise immediately before any yield
                raise litellm.RateLimitError(
                    message="Rate limit exceeded",
                    llm_provider="test",
                    model="model"
                )
                # Add dummy yield to make this an async generator
                yield ChunkEvent(content="")  # pragma: no cover
        
        provider = ErrorProvider()
        events = []
        async for event in provider.get_completion_stream("model", []):
            events.append(event)
        
        assert len(events) == 1
        assert isinstance(events[0], ErrorEvent)
        assert "Rate limit" in events[0].content

    @pytest.mark.asyncio
    async def test_stream_handles_api_error(self):
        """Test that API errors are converted to ErrorEvent."""
        import litellm
        
        class ErrorProvider(MockProvider):
            async def _stream_internal(self, model, messages):
                raise litellm.APIError(
                    message="API error",
                    llm_provider="test",
                    model="model",
                    status_code=500
                )
                yield ChunkEvent(content="")  # pragma: no cover
        
        provider = ErrorProvider()
        events = []
        async for event in provider.get_completion_stream("model", []):
            events.append(event)
        
        assert len(events) == 1
        assert isinstance(events[0], ErrorEvent)
        assert "API error" in events[0].content

    @pytest.mark.asyncio
    async def test_stream_handles_generic_error(self):
        """Test that generic errors are converted to ErrorEvent."""
        class ErrorProvider(MockProvider):
            async def _stream_internal(self, model, messages):
                raise ValueError("Generic error")
                yield ChunkEvent(content="")  # pragma: no cover
        
        provider = ErrorProvider()
        events = []
        async for event in provider.get_completion_stream("model", []):
            events.append(event)
        
        assert len(events) == 1
        assert isinstance(events[0], ErrorEvent)
        assert "Unexpected system error" in events[0].content
