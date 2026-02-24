"""Tests for LLMProvider base class."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace
import litellm

from backend.src.llm.providers.base import LLMProvider
from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.core.infrastructure.exceptions import LLMAPIError, LLMError, LLMRateLimitError
from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    StreamingCompleteEvent,
)


class MockProvider(LLMProvider):
    """Mock implementation of LLMProvider for testing."""
    
    def _validate_dependencies(self) -> None:
        pass
    
    async def get_completion(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
        prompt_cache_key=None,
    ):
        return {"content": "test", "tool_calls": None}
    
    async def _stream_internal(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
        prompt_cache_key=None,
    ):
        yield ChunkEvent(content="Hello")
        yield StreamingCompleteEvent()
    
    async def list_models(self):
        return [{"id": "model1", "provider": "mock", "display_name": "Model 1"}]
    
    def _get_full_model_string(self, model_id: str) -> str:
        return f"mock/{model_id}"


def _messages_with_single_tool_call(
    *,
    tool_call_id: str = "call_1",
    tool_response_id: str = "call_1",
    tool_response_content: str = "total 0",
):
    return [
        {"role": "user", "content": "List files"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": tool_call_id,
                    "name": "run_shell_command",
                    "arguments": {"command": "ls -la"},
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": tool_response_id,
            "content": tool_response_content,
        },
    ]


async def _collect_stream_events(provider):
    events = []
    async for event in provider.get_completion_stream("model", []):
        events.append(event)
    return events


def _provider_with_stream_error(error_factory):
    class ErrorProvider(MockProvider):
        async def _stream_internal(
            self,
            model,
            messages,
            tools=None,
            tool_choice=None,
            parallel_tool_calls=None,
            prompt_cache_key=None,
        ):
            # Keep as async generator shape while raising immediately.
            raise error_factory()
            yield ChunkEvent(content="")  # pragma: no cover

    return ErrorProvider()


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

    def test_build_applies_provider_request_param_hook(self, provider, monkeypatch):
        messages = [{"role": "user", "content": "Hello"}]
        apply_hook_mock = MagicMock(
            side_effect=lambda params, *, model: {**params, "hook_model": model}
        )
        monkeypatch.setattr(provider, "_apply_provider_request_params", apply_hook_mock)

        params = provider._build_request_params("gpt-4", messages)

        apply_hook_mock.assert_called_once()
        assert params["hook_model"] == "gpt-4"

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

    def test_build_raises_on_none_messages(self, provider):
        with pytest.raises(ValueError, match="messages parameter cannot be None"):
            provider._build_request_params("gpt-4", None)

    def test_build_raises_on_non_list_messages(self, provider):
        with pytest.raises(TypeError, match="messages must be list"):
            provider._build_request_params("gpt-4", {"role": "user", "content": "Hello"})

    def test_build_includes_native_tool_calling_params(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "read_file",
                    "parameters": {"type": "object"},
                },
            }
        ]
        params = provider._build_request_params(
            "gpt-4",
            messages,
            tools=tools,
            tool_choice="auto",
            parallel_tool_calls=True,
        )

        assert params["tools"] == tools
        assert params["tool_choice"] == "auto"
        assert params["parallel_tool_calls"] is True

    def test_build_rejects_legacy_top_level_tool_schema(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        tools = [
            {
                "name": "read_file",
                "description": "Read file contents",
                "parameters": {"type": "object", "properties": {"path": {"type": "string"}}},
            }
        ]

        with pytest.raises(LLMAPIError, match="field 'type' must be 'function'"):
            provider._build_request_params("gpt-4", messages, tools=tools)

    def test_build_rejects_non_object_tool_entry(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        tools = ["invalid-tool"]

        with pytest.raises(LLMAPIError, match="expected object"):
            provider._build_request_params("gpt-4", messages, tools=tools)

    def test_build_rejects_missing_function_object(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        tools = [{"type": "function"}]

        with pytest.raises(LLMAPIError, match="missing or invalid 'function' object"):
            provider._build_request_params("gpt-4", messages, tools=tools)

    def test_build_rejects_missing_function_parameters(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        tools = [{"type": "function", "function": {"name": "read_file"}}]

        with pytest.raises(LLMAPIError, match="function.parameters is required"):
            provider._build_request_params("gpt-4", messages, tools=tools)

    def test_build_rejects_non_object_function_parameters(self, provider):
        messages = [{"role": "user", "content": "Hello"}]
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "read_file",
                    "parameters": "not-an-object",
                },
            }
        ]

        with pytest.raises(LLMAPIError, match="function.parameters must be an object"):
            provider._build_request_params("gpt-4", messages, tools=tools)

    def test_build_normalizes_assistant_tool_calls_to_openai_shape(self, provider):
        messages = _messages_with_single_tool_call()

        params = provider._build_request_params("gpt-4", messages)
        assistant_tool_calls = params["messages"][1]["tool_calls"]
        assert assistant_tool_calls == [
            {
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "run_shell_command",
                    "arguments": "{\"command\":\"ls -la\"}",
                },
            }
        ]
        assert params["messages"][2]["tool_call_id"] == "call_1"

    def test_build_drops_orphan_tool_messages_without_matching_tool_call_id(self, provider):
        messages = _messages_with_single_tool_call(
            tool_response_id="missing_call",
            tool_response_content="orphan",
        )

        params = provider._build_request_params("gpt-4", messages)
        assert len(params["messages"]) == 2
        assert params["messages"][-1]["role"] == "assistant"


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

    def test_extract_from_content_tags_when_reasoning_fields_missing(self, provider):
        delta = {"content": "prefix <thinking>hidden chain</thinking> suffix"}

        result = provider._extract_thinking_content(delta)

        assert result == "hidden chain"

    def test_extract_ignores_plain_content_without_thinking_tags(self, provider):
        delta = {"content": "normal assistant text"}

        result = provider._extract_thinking_content(delta)

        assert result is None

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


class TestStreamDeltaHelpers:
    @pytest.fixture
    def provider(self):
        return MockProvider()

    def test_extract_stream_delta_returns_none_for_invalid_chunks(self, provider):
        assert provider._extract_stream_delta(None) is None
        assert provider._extract_stream_delta(SimpleNamespace(choices=[])) is None
        assert provider._extract_stream_delta(SimpleNamespace(choices=[SimpleNamespace(delta=None)])) is None

    def test_extract_stream_delta_returns_delta_for_valid_chunk(self, provider):
        delta = SimpleNamespace(content="hello")
        chunk = SimpleNamespace(choices=[SimpleNamespace(delta=delta)])

        assert provider._extract_stream_delta(chunk) is delta

    def test_extract_stream_delta_supports_tuple_choices(self, provider):
        delta = SimpleNamespace(content="hello")
        chunk = SimpleNamespace(choices=(SimpleNamespace(delta=delta),))

        assert provider._extract_stream_delta(chunk) is delta

    def test_extract_stream_delta_supports_iterable_choices(self, provider):
        delta = SimpleNamespace(content="hello")
        chunk = SimpleNamespace(choices=iter([SimpleNamespace(delta=delta)]))

        assert provider._extract_stream_delta(chunk) is delta

    def test_extract_stream_delta_returns_none_for_non_iterable_choices(self, provider):
        chunk = SimpleNamespace(choices=42)

        assert provider._extract_stream_delta(chunk) is None

    def test_extract_delta_content_supports_object_and_dict_delta(self, provider):
        assert provider._extract_delta_content(SimpleNamespace(content="hello")) == "hello"
        assert provider._extract_delta_content({"content": "world"}) == "world"
        assert provider._extract_delta_content({"content": ""}) is None
        assert provider._extract_delta_content({"content": 123}) is None

    def test_extract_stream_finish_reason_supports_dict_and_object_chunks(self, provider):
        dict_chunk = {"choices": [{"delta": {"content": "hi"}, "finish_reason": "stop"}]}
        obj_chunk = SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content="ok"), finish_reason="tool_calls")]
        )

        assert provider._extract_stream_finish_reason(dict_chunk) == "stop"
        assert provider._extract_stream_finish_reason(obj_chunk) == "tool_calls"

    def test_extract_stream_finish_reason_returns_none_for_missing_values(self, provider):
        assert provider._extract_stream_finish_reason(None) is None
        assert provider._extract_stream_finish_reason({"choices": []}) is None
        assert provider._extract_stream_finish_reason({"choices": [{"delta": {"content": "x"}}]}) is None


class TestStreamUsageDiagnostics:
    @pytest.fixture
    def provider(self):
        return MockProvider()

    def test_record_stream_usage_from_chunk_dict(self, provider):
        usage = {"prompt_tokens": 100, "prompt_tokens_details": {"cached_tokens": 75}}
        captured = provider._record_stream_usage_from_chunk({"usage": usage})

        assert captured == usage
        assert provider.get_last_stream_usage() == usage
        assert provider.get_last_usage() == usage

    def test_record_stream_usage_from_chunk_object_usage_metadata(self, provider):
        usage = SimpleNamespace(
            prompt_token_count=120,
            cached_content_token_count=90,
            total_token_count=180,
        )
        chunk = SimpleNamespace(usage_metadata=usage)
        captured = provider._record_stream_usage_from_chunk(chunk)

        assert captured == {
            "prompt_token_count": 120,
            "cached_content_token_count": 90,
            "total_token_count": 180,
        }

    def test_stream_cache_diagnostics_reports_hit(self, provider):
        provider._record_stream_usage_from_chunk(
            {"usage": {"prompt_tokens": 100, "prompt_tokens_details": {"cached_tokens": 30}}}
        )

        diagnostics = provider.get_stream_cache_diagnostics(model="model")
        assert diagnostics["status"] == "hit"
        assert diagnostics["cache_hit"] is True
        assert diagnostics["cached_tokens"] == 30
        assert diagnostics["prompt_tokens"] == 100
        assert diagnostics["thinking_tokens"] is None

    def test_stream_cache_diagnostics_reports_miss(self, provider):
        provider._record_stream_usage_from_chunk(
            {"usage": {"prompt_tokens": 100, "prompt_tokens_details": {"cached_tokens": 0}}}
        )

        diagnostics = provider.get_stream_cache_diagnostics(model="model")
        assert diagnostics["status"] == "miss"
        assert diagnostics["cache_hit"] is False
        assert diagnostics["cached_tokens"] == 0

    def test_stream_cache_diagnostics_reports_unknown_without_usage(self, provider):
        diagnostics = provider.get_stream_cache_diagnostics(model="model")
        assert diagnostics["status"] == "unknown"
        assert diagnostics["reason"] == "provider_usage_unavailable"
        assert diagnostics["thinking_tokens"] is None

    def test_stream_cache_diagnostics_extracts_openai_reasoning_tokens(self, provider):
        provider._record_stream_usage_from_chunk(
            {
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 40,
                    "total_tokens": 140,
                    "completion_tokens_details": {"reasoning_tokens": 12},
                }
            }
        )

        diagnostics = provider.get_stream_cache_diagnostics(model="model")
        assert diagnostics["thinking_tokens"] == 12

    def test_stream_cache_diagnostics_extracts_gemini_thoughts_tokens(self, provider):
        provider._record_stream_usage_from_chunk(
            {"usageMetadata": {"thoughtsTokenCount": 9, "totalTokenCount": 99}}
        )

        diagnostics = provider.get_stream_cache_diagnostics(model="model")
        assert diagnostics["thinking_tokens"] == 9

    def test_record_usage_from_completion_response(self, provider):
        response = {"usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}}

        captured = provider._record_usage_from_payload_container(response)

        assert captured == response["usage"]
        assert provider.get_last_usage() == response["usage"]


class TestCompletionContentHelpers:
    @pytest.fixture
    def provider(self):
        return MockProvider()

    def test_extract_completion_content_supports_iterable_choices(self, provider):
        response = SimpleNamespace(
            choices=iter([SimpleNamespace(message=SimpleNamespace(content="ok"))])
        )

        content = provider._extract_completion_content(
            response,
            model="model",
            invalid_response_message="Invalid response",
        )

        assert content == "ok"

    def test_extract_completion_content_raises_on_non_iterable_choices(self, provider):
        response = SimpleNamespace(choices=42)

        with pytest.raises(LLMAPIError, match="Invalid response"):
            provider._extract_completion_content(
                response,
                model="model",
                invalid_response_message="Invalid response",
            )

    def test_extract_completion_content_raises_on_malformed_string_choices(self, provider):
        response = SimpleNamespace(choices="not-a-list")

        with pytest.raises(LLMAPIError, match="Invalid response"):
            provider._extract_completion_content(
                response,
                model="model",
                invalid_response_message="Invalid response",
            )


class TestCompletionResponseHelpers:
    @pytest.fixture
    def provider(self):
        return MockProvider()

    def test_extract_completion_response_parses_openai_style_tool_calls(self, provider):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="tool_calls",
                    message=SimpleNamespace(
                        content=None,
                        tool_calls=[
                            SimpleNamespace(
                                id="call_1",
                                function=SimpleNamespace(
                                    name="read_file",
                                    arguments='{"path":"/tmp/demo.txt"}',
                                ),
                            )
                        ],
                    ),
                )
            ]
        )

        normalized = provider._extract_completion_response(
            response,
            model="model",
            invalid_response_message="Invalid response",
        )

        assert normalized["content"] == ""
        assert normalized["finish_reason"] == "tool_calls"
        assert normalized["tool_calls"] == [
            {
                "id": "call_1",
                "name": "read_file",
                "arguments": {"path": "/tmp/demo.txt"},
            }
        ]

    def test_extract_completion_response_parses_anthropic_tool_use_blocks(self, provider):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=[
                            {"type": "text", "text": "Running tool"},
                            {
                                "type": "tool_use",
                                "id": "toolu_1",
                                "name": "read_file",
                                "input": {"path": "/tmp/demo.txt"},
                            },
                        ]
                    )
                )
            ]
        )

        normalized = provider._extract_completion_response(
            response,
            model="model",
            invalid_response_message="Invalid response",
        )

        assert normalized["content"] == "Running tool"
        assert normalized["tool_calls"] == [
            {
                "id": "toolu_1",
                "name": "read_file",
                "arguments": {"path": "/tmp/demo.txt"},
            }
        ]

    def test_extract_completion_response_raises_on_invalid_tool_arguments_json(self, provider):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=None,
                        tool_calls=[
                            SimpleNamespace(
                                id="call_1",
                                function=SimpleNamespace(
                                    name="read_file",
                                    arguments="{bad json}",
                                ),
                            )
                        ],
                    )
                )
            ]
        )

        with pytest.raises(LLMAPIError, match="invalid tool arguments JSON"):
            provider._extract_completion_response(
                response,
                model="model",
                invalid_response_message="Invalid response",
            )

    def test_extract_completion_response_reads_choice_level_text_fallback(self, provider):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    text="legacy text payload",
                    message=SimpleNamespace(content=None),
                )
            ]
        )

        normalized = provider._extract_completion_response(
            response,
            model="model",
            invalid_response_message="Invalid response",
        )

        assert normalized["content"] == "legacy text payload"

    def test_extract_completion_response_reads_message_content_block_content_key(self, provider):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=[
                            {"type": "text", "content": "hello"},
                            {"type": "output_text", "content": {"text": " world"}},
                        ]
                    )
                )
            ]
        )

        normalized = provider._extract_completion_response(
            response,
            model="model",
            invalid_response_message="Invalid response",
        )

        assert normalized["content"] == "hello world"


class TestGetCompletionStream:
    """Tests for get_completion_stream method."""

    @pytest.fixture
    def provider(self):
        return MockProvider()

    @pytest.mark.asyncio
    async def test_stream_yields_events(self, provider):
        events = await _collect_stream_events(provider)
        
        assert len(events) == 2
        assert isinstance(events[0], ChunkEvent)
        assert isinstance(events[1], StreamingCompleteEvent)

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("error_factory", "expected_message"),
        [
            (
                lambda: litellm.RateLimitError(
                    message="Rate limit exceeded",
                    llm_provider="test",
                    model="model",
                ),
                "Rate limit",
            ),
            (
                lambda: litellm.APIError(
                    message="API error",
                    llm_provider="test",
                    model="model",
                    status_code=500,
                ),
                "API error",
            ),
            (lambda: ValueError("Generic error"), "Unexpected system error"),
        ],
        ids=["rate_limit", "api_error", "generic_error"],
    )
    async def test_stream_maps_errors_to_error_event(self, error_factory, expected_message):
        provider = _provider_with_stream_error(error_factory)
        events = await _collect_stream_events(provider)

        assert len(events) == 1
        assert isinstance(events[0], ErrorEvent)
        assert expected_message in events[0].content


class TestStandardCompletionHelper:
    @pytest.fixture
    def provider(self):
        return MockProvider()

    def test_build_standard_completion_params_adds_stream_fields_when_enabled(self, provider):
        messages = [{"role": "user", "content": "Hello"}]

        params = provider._build_standard_completion_params(
            "gpt-4",
            messages,
            include_stream=True,
        )

        assert params["model"] == "mock/gpt-4"
        assert params["stream"] is True
        assert params["stream_options"] == {"include_usage": True}

    @pytest.mark.asyncio
    async def test_get_completion_with_standard_params_builds_params_then_delegates(
        self, provider, monkeypatch
    ):
        messages = [{"role": "user", "content": "Hello"}]
        tools = [{"type": "function", "function": {"name": "ping", "parameters": {"type": "object"}}}]
        built_params = {"model": "mock/model", "messages": messages}
        build_params_mock = MagicMock(return_value=built_params)
        get_completion_mock = AsyncMock(return_value={"content": "ok"})

        monkeypatch.setattr(provider, "_build_standard_completion_params", build_params_mock)
        monkeypatch.setattr(provider, "_get_completion_with_standard_errors", get_completion_mock)

        result = await provider._get_completion_with_standard_params(
            provider_label="Mock",
            model="gpt-4",
            messages=messages,
            tools=tools,
            tool_choice="auto",
            parallel_tool_calls=True,
            prompt_cache_key="cache-key",
            invalid_response_message="Invalid response",
        )

        build_params_mock.assert_called_once_with(
            "gpt-4",
            messages,
            tools=tools,
            tool_choice="auto",
            parallel_tool_calls=True,
            prompt_cache_key="cache-key",
        )
        get_completion_mock.assert_awaited_once_with(
            provider_label="Mock",
            model="gpt-4",
            params=built_params,
            invalid_response_message="Invalid response",
        )
        assert result == {"content": "ok"}

    @pytest.mark.asyncio
    async def test_returns_content_for_valid_response(self, provider, monkeypatch):
        response = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))]
        )
        monkeypatch.setattr(litellm, "acompletion", AsyncMock(return_value=response))

        result = await provider._get_completion_with_standard_errors(
            provider_label="Mock",
            model="model",
            params={"model": "mock/model", "messages": []},
        )

        assert result == {"content": "ok"}

    @pytest.mark.asyncio
    async def test_raises_llm_api_error_for_invalid_response_shape(self, provider, monkeypatch):
        response = SimpleNamespace(choices=[SimpleNamespace(message=None)])
        monkeypatch.setattr(litellm, "acompletion", AsyncMock(return_value=response))

        with pytest.raises(LLMAPIError, match="Invalid response"):
            await provider._get_completion_with_standard_errors(
                provider_label="Mock",
                model="model",
                params={"model": "mock/model", "messages": []},
                invalid_response_message="Invalid response",
            )

    @pytest.mark.asyncio
    async def test_maps_litellm_rate_limit_error(self, provider, monkeypatch):
        async def raise_rate_limit(**_kwargs):
            raise litellm.RateLimitError(
                message="rate-limited",
                llm_provider="mock",
                model="model",
            )

        monkeypatch.setattr(litellm, "acompletion", raise_rate_limit)

        with pytest.raises(LLMRateLimitError, match="Mock rate limit exceeded"):
            await provider._get_completion_with_standard_errors(
                provider_label="Mock",
                model="model",
                params={"model": "mock/model", "messages": []},
            )

    @pytest.mark.asyncio
    async def test_maps_litellm_api_error(self, provider, monkeypatch):
        async def raise_api_error(**_kwargs):
            raise litellm.APIError(
                message="api-failure",
                llm_provider="mock",
                model="model",
                status_code=500,
            )

        monkeypatch.setattr(litellm, "acompletion", raise_api_error)

        with pytest.raises(LLMAPIError, match="Mock API error"):
            await provider._get_completion_with_standard_errors(
                provider_label="Mock",
                model="model",
                params={"model": "mock/model", "messages": []},
            )

    @pytest.mark.asyncio
    async def test_maps_generic_http_520_exception_to_llm_api_error(self, provider, monkeypatch):
        async def raise_http_520(**_kwargs):
            error = RuntimeError("transport failed")
            error.response = SimpleNamespace(status_code=520)
            raise error

        monkeypatch.setattr(litellm, "acompletion", raise_http_520)

        with pytest.raises(LLMAPIError, match="HTTP 520"):
            await provider._get_completion_with_standard_errors(
                provider_label="Mock",
                model="model",
                params={"model": "mock/model", "messages": []},
            )

    @pytest.mark.asyncio
    async def test_maps_generic_exception_to_llm_error(self, provider, monkeypatch):
        async def raise_generic(**_kwargs):
            raise RuntimeError("boom")

        monkeypatch.setattr(litellm, "acompletion", raise_generic)

        with pytest.raises(LLMError, match="unexpected error occurred with Mock"):
            await provider._get_completion_with_standard_errors(
                provider_label="Mock",
                model="model",
                params={"model": "mock/model", "messages": []},
            )


class TestOnlineLLMProvider:
    class _MockOnlineProvider(OnlineLLMProvider):
        provider_label = "MockOnline"
        model_prefix = "mock"

    def test_requires_api_key(self):
        with pytest.raises(ValueError, match="requires an 'api_key'"):
            self._MockOnlineProvider()

    def test_get_full_model_string_uses_optional_prefix(self):
        provider = self._MockOnlineProvider(api_key="test-key")

        assert provider._get_full_model_string("model") == "mock/model"
        assert provider._get_full_model_string("mock/model") == "mock/model"
        provider.model_prefix = None
        assert provider._get_full_model_string("model") == "model"

    @pytest.mark.asyncio
    async def test_get_completion_delegates_with_provider_defaults(self, monkeypatch):
        provider = self._MockOnlineProvider(api_key="test-key")
        messages = [{"role": "user", "content": "hello"}]
        get_completion_mock = AsyncMock(return_value={"content": "ok"})
        monkeypatch.setattr(provider, "_get_completion_with_standard_params", get_completion_mock)

        result = await provider.get_completion("model", messages, prompt_cache_key="cache-key")

        get_completion_mock.assert_awaited_once_with(
            provider_label="MockOnline",
            model="model",
            messages=messages,
            tools=None,
            tool_choice=None,
            parallel_tool_calls=None,
            prompt_cache_key="cache-key",
            invalid_response_message=None,
        )
        assert result == {"content": "ok"}

    @pytest.mark.asyncio
    async def test_stream_internal_uses_text_stream_by_default(self, monkeypatch):
        provider = self._MockOnlineProvider(api_key="test-key")
        calls = {"text": 0, "thinking": 0}

        async def fake_text_stream(_params):
            calls["text"] += 1
            yield ChunkEvent(content="text")

        async def fake_thinking_stream(_params):
            calls["thinking"] += 1
            yield ChunkEvent(content="thinking")

        monkeypatch.setattr(provider, "_build_standard_completion_params", MagicMock(return_value={}))
        monkeypatch.setattr(provider, "_stream_text_content_events", fake_text_stream)
        monkeypatch.setattr(provider, "_stream_thinking_and_text_events", fake_thinking_stream)

        events = []
        async for event in provider._stream_internal("model", []):
            events.append(event)

        assert calls == {"text": 1, "thinking": 0}
        assert [event.content for event in events] == ["text"]

    @pytest.mark.asyncio
    async def test_stream_internal_uses_thinking_stream_when_enabled(self, monkeypatch):
        provider = self._MockOnlineProvider(api_key="test-key")
        provider.stream_includes_thinking = True
        calls = {"text": 0, "thinking": 0}

        async def fake_text_stream(_params):
            calls["text"] += 1
            yield ChunkEvent(content="text")

        async def fake_thinking_stream(_params):
            calls["thinking"] += 1
            yield ChunkEvent(content="thinking")

        monkeypatch.setattr(provider, "_build_standard_completion_params", MagicMock(return_value={}))
        monkeypatch.setattr(provider, "_stream_text_content_events", fake_text_stream)
        monkeypatch.setattr(provider, "_stream_thinking_and_text_events", fake_thinking_stream)

        events = []
        async for event in provider._stream_internal("model", []):
            events.append(event)

        assert calls == {"text": 0, "thinking": 1}
        assert [event.content for event in events] == ["thinking"]

    @pytest.mark.asyncio
    async def test_stream_internal_forwards_completion_kwargs(self, monkeypatch):
        provider = self._MockOnlineProvider(api_key="test-key")
        build_params_mock = MagicMock(return_value={})

        async def fake_text_stream(_params):
            yield ChunkEvent(content="text")

        monkeypatch.setattr(provider, "_build_stream_completion_params", build_params_mock)
        monkeypatch.setattr(provider, "_stream_text_content_events", fake_text_stream)

        events = []
        async for event in provider._stream_internal(
            "model",
            [],
            tools=[{"type": "function", "function": {"name": "noop"}}],
            tool_choice="auto",
            parallel_tool_calls=True,
            prompt_cache_key="cache-key",
        ):
            events.append(event)

        build_params_mock.assert_called_once_with(
            model="model",
            messages=[],
            tools=[{"type": "function", "function": {"name": "noop"}}],
            tool_choice="auto",
            parallel_tool_calls=True,
            prompt_cache_key="cache-key",
        )
        assert [event.content for event in events] == ["text"]

    def test_build_stream_completion_params_enables_stream_mode(self, monkeypatch):
        provider = self._MockOnlineProvider(api_key="test-key")
        build_params_mock = MagicMock(return_value={"ok": True})
        monkeypatch.setattr(provider, "_build_standard_completion_params", build_params_mock)

        result = provider._build_stream_completion_params(
            model="model",
            messages=[],
            tools=[{"type": "function", "function": {"name": "noop"}}],
            tool_choice="auto",
            parallel_tool_calls=True,
            prompt_cache_key="cache-key",
        )

        build_params_mock.assert_called_once_with(
            "model",
            [],
            tools=[{"type": "function", "function": {"name": "noop"}}],
            tool_choice="auto",
            parallel_tool_calls=True,
            prompt_cache_key="cache-key",
            include_stream=True,
        )
        assert result == {"ok": True}
