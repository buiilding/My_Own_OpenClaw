import pytest

from backend.src.core.config.models import AppConfig
from backend.src.core.events.streaming_events import ErrorEvent, ChunkEvent
from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.llm.client import LiteLLMClient


DEFAULT_STREAM_DIAGNOSTICS = {
    "model": "model",
    "status": "unknown",
    "cache_hit": None,
    "cached_tokens": None,
    "prompt_tokens": None,
    "completion_tokens": None,
    "thinking_tokens": None,
    "total_tokens": None,
    "reason": "provider_usage_unavailable",
}


def make_client() -> LiteLLMClient:
    return LiteLLMClient(AppConfig())


def attach_provider(monkeypatch, provider) -> None:
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)


def make_client_with_provider(monkeypatch, provider) -> LiteLLMClient:
    client = make_client()
    attach_provider(monkeypatch, provider)
    return client


class DummyProvider:
    def __init__(
        self,
        response=None,
        stream_events=None,
        diagnostics=None,
        stream_payload=None,
        supports_streaming_tool_turns=False,
    ):
        self.response = response
        self.stream_events = stream_events or []
        self.stream_payload = stream_payload
        self._supports_streaming_tool_turns = supports_streaming_tool_turns
        self.diagnostics = diagnostics or dict(DEFAULT_STREAM_DIAGNOSTICS)
        self.clear_usage_called = False
        self.last_completion_kwargs = None
        self.last_stream_kwargs = None

    async def get_completion(self, model, messages, **kwargs):
        self.last_completion_kwargs = kwargs
        return self.response

    async def get_completion_stream(self, model, messages, **kwargs):
        self.last_stream_kwargs = kwargs
        for event in self.stream_events:
            yield event

    def clear_last_stream_usage(self):
        self.clear_usage_called = True

    def get_stream_cache_diagnostics(self, model):
        payload = dict(self.diagnostics)
        payload.setdefault("model", model)
        return payload

    def get_last_stream_response_payload(self):
        return self.stream_payload

    def supports_streaming_tool_turns(self, model):
        _ = model
        return self._supports_streaming_tool_turns


class FailingStreamProvider:
    async def get_completion(self, model, messages, **kwargs):
        return {"content": "ok"}

    async def get_completion_stream(self, model, messages, **kwargs):
        raise RuntimeError("stream exploded")
        yield ChunkEvent(content="never")  # pragma: no cover

    def clear_last_stream_usage(self):
        return None

    def get_stream_cache_diagnostics(self, model):
        payload = dict(DEFAULT_STREAM_DIAGNOSTICS)
        payload["model"] = model
        return payload

    def get_last_stream_response_payload(self):
        return None

    def supports_streaming_tool_turns(self, model):
        _ = model
        return False


@pytest.mark.asyncio
async def test_get_completion_returns_content(monkeypatch):
    provider = DummyProvider(response={"content": "ok"})
    client = make_client_with_provider(monkeypatch, provider)

    result = await client.get_completion("model", [])
    assert result == "ok"


@pytest.mark.asyncio
async def test_get_completion_invalid_response_type(monkeypatch):
    provider = DummyProvider(response=["not-a-dict"])
    client = make_client_with_provider(monkeypatch, provider)

    with pytest.raises(LLMAPIError):
        await client.get_completion("model", [])


@pytest.mark.asyncio
async def test_get_completion_missing_content(monkeypatch):
    provider = DummyProvider(response={"no": "content"})
    client = make_client_with_provider(monkeypatch, provider)

    with pytest.raises(LLMAPIError):
        await client.get_completion("model", [])


@pytest.mark.asyncio
async def test_get_completion_non_string_content(monkeypatch):
    provider = DummyProvider(response={"content": 123})
    client = make_client_with_provider(monkeypatch, provider)

    with pytest.raises(LLMAPIError):
        await client.get_completion("model", [])


@pytest.mark.asyncio
async def test_get_completion_response_normalizes_none_content(monkeypatch):
    provider = DummyProvider(response={"content": None})
    client = make_client_with_provider(monkeypatch, provider)

    result = await client.get_completion_response("model", [])
    assert result["content"] == ""


@pytest.mark.asyncio
async def test_get_completion_response_stores_usage_diagnostics(monkeypatch):
    provider = DummyProvider(
        response={"content": "ok"},
        diagnostics={
            "model": "model",
            "status": "hit",
            "cache_hit": False,
            "cached_tokens": 0,
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "thinking_tokens": 2,
            "total_tokens": 15,
            "reason": None,
        },
    )
    client = make_client_with_provider(monkeypatch, provider)

    _ = await client.get_completion_response("model", [])
    diagnostics = client.get_last_stream_cache_diagnostics()
    assert diagnostics is not None
    assert diagnostics["prompt_tokens"] == 10
    assert diagnostics["thinking_tokens"] == 2


@pytest.mark.asyncio
async def test_get_last_stream_cache_diagnostics_returns_deep_copy(monkeypatch):
    provider = DummyProvider(
        response={"content": "ok"},
        diagnostics={
            "model": "model",
            "status": "hit",
            "nested": {"prompt_tokens": 7},
        },
    )
    client = make_client_with_provider(monkeypatch, provider)

    _ = await client.get_completion_response("model", [])
    diagnostics = client.get_last_stream_cache_diagnostics()
    assert diagnostics is not None
    diagnostics["nested"]["prompt_tokens"] = 999

    diagnostics_again = client.get_last_stream_cache_diagnostics()
    assert diagnostics_again is not None
    assert diagnostics_again["nested"]["prompt_tokens"] == 7


@pytest.mark.asyncio
async def test_get_completion_response_clears_tracking_state_on_provider_failure(
    monkeypatch,
):
    client = make_client()

    healthy_provider = DummyProvider(
        response={"content": "ok"},
        diagnostics={"model": "model", "status": "hit"},
    )
    attach_provider(monkeypatch, healthy_provider)
    _ = await client.get_completion_response("model", [])
    assert client.get_last_stream_cache_diagnostics() is not None
    assert client.get_last_stream_response_payload() == {"content": "ok"}

    class ExplodingProvider(DummyProvider):
        async def get_completion(self, model, messages, **kwargs):
            _ = (model, messages, kwargs)
            raise RuntimeError("boom")

    exploding_provider = ExplodingProvider(response={"content": "unused"})
    attach_provider(monkeypatch, exploding_provider)

    with pytest.raises(LLMAPIError, match="LLM completion error"):
        await client.get_completion_response("model", [])

    assert client.get_last_stream_cache_diagnostics() is None
    assert client.get_last_stream_response_payload() is None


@pytest.mark.asyncio
async def test_get_completion_stream_provider_error(monkeypatch):
    client = make_client()

    def raise_provider(*_args, **_kwargs):
        raise ValueError("no provider")

    monkeypatch.setattr("backend.src.llm.client.get_provider", raise_provider)

    events = [event async for event in client.get_completion_stream("model", [])]
    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert "LLM provider error" in events[0].content


@pytest.mark.asyncio
async def test_get_completion_stream_provider_unexpected_error(monkeypatch):
    client = make_client()

    def raise_provider(*_args, **_kwargs):
        raise RuntimeError("broken provider registry")

    monkeypatch.setattr("backend.src.llm.client.get_provider", raise_provider)

    events = [event async for event in client.get_completion_stream("model", [])]
    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert "broken provider registry" in events[0].content


@pytest.mark.asyncio
async def test_get_completion_stream_yields_provider_events(monkeypatch):
    provider = DummyProvider(stream_events=[ChunkEvent(content="hi")])
    client = make_client_with_provider(monkeypatch, provider)

    events = [event async for event in client.get_completion_stream("model", [])]
    assert len(events) == 1
    assert isinstance(events[0], ChunkEvent)
    assert events[0].content == "hi"
    assert provider.clear_usage_called is True


@pytest.mark.asyncio
async def test_get_completion_stream_stores_cache_diagnostics(monkeypatch):
    provider = DummyProvider(
        stream_events=[ChunkEvent(content="hi")],
        diagnostics={
            "model": "model",
            "status": "hit",
            "cache_hit": True,
            "cached_tokens": 321,
            "prompt_tokens": 640,
            "completion_tokens": 32,
            "thinking_tokens": 7,
            "total_tokens": 672,
            "reason": None,
        },
    )
    client = make_client_with_provider(monkeypatch, provider)

    _ = [event async for event in client.get_completion_stream("model", [])]
    diagnostics = client.get_last_stream_cache_diagnostics()
    assert diagnostics is not None
    assert diagnostics["status"] == "hit"
    assert diagnostics["cached_tokens"] == 321


@pytest.mark.asyncio
async def test_get_completion_stream_stores_last_stream_response_payload(monkeypatch):
    provider = DummyProvider(
        stream_events=[ChunkEvent(content="partial")],
        stream_payload={
            "content": "final",
            "tool_calls": [{"id": "call_1", "name": "read_file", "arguments": {}}],
            "finish_reason": "tool_calls",
        },
    )
    client = make_client_with_provider(monkeypatch, provider)

    _ = [event async for event in client.get_completion_stream("model", [])]
    payload = client.get_last_stream_response_payload()
    assert payload is not None
    assert payload["content"] == "final"
    assert payload["finish_reason"] == "tool_calls"
    assert payload["tool_calls"][0]["id"] == "call_1"


@pytest.mark.asyncio
async def test_get_last_stream_response_payload_returns_deep_copy(monkeypatch):
    provider = DummyProvider(
        stream_events=[ChunkEvent(content="partial")],
        stream_payload={
            "content": "final",
            "tool_calls": [{"id": "call_1", "name": "read_file", "arguments": {"path": "/tmp/a"}}],
        },
    )
    client = make_client_with_provider(monkeypatch, provider)

    _ = [event async for event in client.get_completion_stream("model", [])]
    payload = client.get_last_stream_response_payload()
    assert payload is not None
    payload["tool_calls"][0]["arguments"]["path"] = "/tmp/mutated"

    payload_again = client.get_last_stream_response_payload()
    assert payload_again is not None
    assert payload_again["tool_calls"][0]["arguments"]["path"] == "/tmp/a"


def test_extract_content_rejects_invalid_payloads():
    with pytest.raises(LLMAPIError):
        LiteLLMClient._extract_content(["bad"], model="m")

    with pytest.raises(LLMAPIError):
        LiteLLMClient._extract_content({"no": "content"}, model="m")

    with pytest.raises(LLMAPIError):
        LiteLLMClient._extract_content({"content": 1}, model="m")


@pytest.mark.asyncio
async def test_get_completion_wraps_provider_resolution_error(monkeypatch):
    client = make_client()

    def raise_provider(*_args, **_kwargs):
        raise ValueError("no provider")

    monkeypatch.setattr("backend.src.llm.client.get_provider", raise_provider)

    with pytest.raises(LLMAPIError, match="LLM provider error"):
        await client.get_completion("model", [])


@pytest.mark.asyncio
async def test_get_completion_wraps_unexpected_provider_completion_error(monkeypatch):
    client = make_client()

    class ExplodingProvider:
        def clear_last_stream_usage(self):
            return None

        async def get_completion(self, model, messages):
            raise RuntimeError("boom")

    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: ExplodingProvider())

    with pytest.raises(LLMAPIError, match="LLM completion error"):
        await client.get_completion("model", [])


@pytest.mark.asyncio
async def test_get_completion_stream_handles_iteration_error(monkeypatch):
    client = make_client()
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: FailingStreamProvider())

    events = [event async for event in client.get_completion_stream("model", [])]
    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert "LLM streaming error" in events[0].content


@pytest.mark.asyncio
async def test_get_completion_response_forwards_native_tool_calling_params(monkeypatch):
    provider = DummyProvider(response={"content": "", "tool_calls": []})
    client = make_client_with_provider(monkeypatch, provider)

    tools = [{"type": "function", "function": {"name": "read_file", "parameters": {"type": "object"}}}]
    _ = await client.get_completion_response(
        "model",
        [],
        tools=tools,
        tool_choice="auto",
        parallel_tool_calls=True,
    )

    assert provider.last_completion_kwargs == {
        "tools": tools,
        "tool_choice": "auto",
        "parallel_tool_calls": True,
    }


@pytest.mark.asyncio
async def test_get_completion_response_forwards_prompt_cache_key(monkeypatch):
    provider = DummyProvider(response={"content": "ok"})
    client = make_client_with_provider(monkeypatch, provider)

    _ = await client.get_completion_response(
        "model",
        [],
        prompt_cache_key="conv-123",
    )

    assert provider.last_completion_kwargs == {
        "tools": None,
        "tool_choice": None,
        "parallel_tool_calls": None,
        "prompt_cache_key": "conv-123",
    }


@pytest.mark.asyncio
async def test_get_completion_response_normalizes_tool_calls(monkeypatch):
    provider = DummyProvider(
        response={
            "content": "",
            "tool_calls": [
                {
                    "id": "call_1",
                    "name": "read_file",
                    "arguments": {"path": "/tmp/a.txt"},
                }
            ],
            "finish_reason": "tool_calls",
        }
    )
    client = make_client_with_provider(monkeypatch, provider)

    result = await client.get_completion_response("model", [])

    assert result["content"] == ""
    assert result["tool_calls"][0]["id"] == "call_1"
    assert result["tool_calls"][0]["name"] == "read_file"
    assert result["tool_calls"][0]["arguments"]["path"] == "/tmp/a.txt"
    assert result["finish_reason"] == "tool_calls"


@pytest.mark.asyncio
async def test_get_completion_response_rejects_non_list_tool_calls(monkeypatch):
    provider = DummyProvider(response={"content": "", "tool_calls": {"bad": "value"}})
    client = make_client_with_provider(monkeypatch, provider)

    with pytest.raises(LLMAPIError, match="Invalid tool_calls type"):
        await client.get_completion_response("model", [])


@pytest.mark.asyncio
async def test_get_completion_response_rejects_non_dict_tool_call_entry(monkeypatch):
    provider = DummyProvider(response={"content": "", "tool_calls": [123]})
    client = make_client_with_provider(monkeypatch, provider)

    with pytest.raises(LLMAPIError, match="Invalid tool call at index 0"):
        await client.get_completion_response("model", [])


@pytest.mark.asyncio
async def test_get_completion_response_rejects_non_string_finish_reason(monkeypatch):
    provider = DummyProvider(response={"content": "", "finish_reason": 123})
    client = make_client_with_provider(monkeypatch, provider)

    with pytest.raises(LLMAPIError, match="Invalid finish_reason type"):
        await client.get_completion_response("model", [])


@pytest.mark.asyncio
async def test_native_tool_calling_params_and_tool_calls_always_preserved(monkeypatch):
    provider = DummyProvider(
        response={
            "content": "",
            "tool_calls": [{"id": "call_1", "name": "read_file", "arguments": {}}],
        },
        stream_events=[ChunkEvent(content="ok")],
    )
    client = make_client_with_provider(monkeypatch, provider)

    response = await client.get_completion_response(
        "model",
        [],
        tools=[{"type": "function", "function": {"name": "read_file"}}],
        tool_choice="required",
        parallel_tool_calls=True,
    )
    _ = [
        event
        async for event in client.get_completion_stream(
            "model",
            [],
            tools=[{"type": "function", "function": {"name": "read_file"}}],
            tool_choice="required",
            parallel_tool_calls=True,
        )
    ]

    assert provider.last_completion_kwargs == {
        "tools": [{"type": "function", "function": {"name": "read_file"}}],
        "tool_choice": "required",
        "parallel_tool_calls": True,
    }
    assert provider.last_stream_kwargs == {
        "tools": [{"type": "function", "function": {"name": "read_file"}}],
        "tool_choice": "required",
        "parallel_tool_calls": True,
    }
    assert response["tool_calls"] == [{"id": "call_1", "name": "read_file", "arguments": {}}]


@pytest.mark.asyncio
async def test_get_completion_stream_forwards_prompt_cache_key(monkeypatch):
    provider = DummyProvider(stream_events=[ChunkEvent(content="ok")])
    client = make_client_with_provider(monkeypatch, provider)

    _ = [
        event
        async for event in client.get_completion_stream(
            "model",
            [],
            prompt_cache_key="conv-xyz",
        )
    ]

    assert provider.last_stream_kwargs == {
        "tools": None,
        "tool_choice": None,
        "parallel_tool_calls": None,
        "prompt_cache_key": "conv-xyz",
    }


def test_supports_streaming_tool_turns_delegates_to_provider(monkeypatch):
    provider = DummyProvider(supports_streaming_tool_turns=True)
    client = make_client_with_provider(monkeypatch, provider)

    assert client.supports_streaming_tool_turns("model") is True


def test_supports_streaming_tool_turns_falls_back_to_false_on_provider_error(monkeypatch):
    client = make_client()

    def raise_provider(*_args, **_kwargs):
        raise ValueError("missing provider")

    monkeypatch.setattr("backend.src.llm.client.get_provider", raise_provider)

    assert client.supports_streaming_tool_turns("model") is False
