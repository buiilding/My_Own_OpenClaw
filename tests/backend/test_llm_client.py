import pytest

from backend.src.core.config.models import AppConfig
from backend.src.core.events.streaming_events import ErrorEvent, ChunkEvent
from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.llm.client import LiteLLMClient


class DummyProvider:
    def __init__(self, response=None, stream_events=None, diagnostics=None):
        self.response = response
        self.stream_events = stream_events or []
        self.diagnostics = diagnostics or {
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


class FailingStreamProvider:
    async def get_completion(self, model, messages, **kwargs):
        return {"content": "ok"}

    async def get_completion_stream(self, model, messages, **kwargs):
        raise RuntimeError("stream exploded")
        yield ChunkEvent(content="never")  # pragma: no cover

    def clear_last_stream_usage(self):
        return None

    def get_stream_cache_diagnostics(self, model):
        return {
            "model": model,
            "status": "unknown",
            "cache_hit": None,
            "cached_tokens": None,
            "prompt_tokens": None,
            "completion_tokens": None,
            "thinking_tokens": None,
            "total_tokens": None,
            "reason": "provider_usage_unavailable",
        }


@pytest.mark.asyncio
async def test_get_completion_returns_content(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
    provider = DummyProvider(response={"content": "ok"})
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

    result = await client.get_completion("model", [])
    assert result == "ok"


@pytest.mark.asyncio
async def test_get_completion_invalid_response_type(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
    provider = DummyProvider(response=["not-a-dict"])
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

    with pytest.raises(LLMAPIError):
        await client.get_completion("model", [])


@pytest.mark.asyncio
async def test_get_completion_missing_content(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
    provider = DummyProvider(response={"no": "content"})
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

    with pytest.raises(LLMAPIError):
        await client.get_completion("model", [])


@pytest.mark.asyncio
async def test_get_completion_non_string_content(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
    provider = DummyProvider(response={"content": 123})
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

    with pytest.raises(LLMAPIError):
        await client.get_completion("model", [])


@pytest.mark.asyncio
async def test_get_completion_response_normalizes_none_content(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
    provider = DummyProvider(response={"content": None})
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

    result = await client.get_completion_response("model", [])
    assert result["content"] == ""


@pytest.mark.asyncio
async def test_get_completion_response_stores_usage_diagnostics(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
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
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

    _ = await client.get_completion_response("model", [])
    diagnostics = client.get_last_stream_cache_diagnostics()
    assert diagnostics is not None
    assert diagnostics["prompt_tokens"] == 10
    assert diagnostics["thinking_tokens"] == 2


@pytest.mark.asyncio
async def test_get_completion_stream_provider_error(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)

    def raise_provider(*_args, **_kwargs):
        raise ValueError("no provider")

    monkeypatch.setattr("backend.src.llm.client.get_provider", raise_provider)

    events = [event async for event in client.get_completion_stream("model", [])]
    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert "LLM provider error" in events[0].content


@pytest.mark.asyncio
async def test_get_completion_stream_provider_unexpected_error(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)

    def raise_provider(*_args, **_kwargs):
        raise RuntimeError("broken provider registry")

    monkeypatch.setattr("backend.src.llm.client.get_provider", raise_provider)

    events = [event async for event in client.get_completion_stream("model", [])]
    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert "broken provider registry" in events[0].content


@pytest.mark.asyncio
async def test_get_completion_stream_yields_provider_events(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
    provider = DummyProvider(stream_events=[ChunkEvent(content="hi")])
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

    events = [event async for event in client.get_completion_stream("model", [])]
    assert len(events) == 1
    assert isinstance(events[0], ChunkEvent)
    assert events[0].content == "hi"
    assert provider.clear_usage_called is True


@pytest.mark.asyncio
async def test_get_completion_stream_stores_cache_diagnostics(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
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
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

    _ = [event async for event in client.get_completion_stream("model", [])]
    diagnostics = client.get_last_stream_cache_diagnostics()
    assert diagnostics is not None
    assert diagnostics["status"] == "hit"
    assert diagnostics["cached_tokens"] == 321


def test_extract_content_rejects_invalid_payloads():
    with pytest.raises(LLMAPIError):
        LiteLLMClient._extract_content(["bad"], model="m")

    with pytest.raises(LLMAPIError):
        LiteLLMClient._extract_content({"no": "content"}, model="m")

    with pytest.raises(LLMAPIError):
        LiteLLMClient._extract_content({"content": 1}, model="m")


@pytest.mark.asyncio
async def test_get_completion_wraps_provider_resolution_error(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)

    def raise_provider(*_args, **_kwargs):
        raise ValueError("no provider")

    monkeypatch.setattr("backend.src.llm.client.get_provider", raise_provider)

    with pytest.raises(LLMAPIError, match="LLM provider error"):
        await client.get_completion("model", [])


@pytest.mark.asyncio
async def test_get_completion_wraps_unexpected_provider_completion_error(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)

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
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: FailingStreamProvider())

    events = [event async for event in client.get_completion_stream("model", [])]
    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert "LLM streaming error" in events[0].content


@pytest.mark.asyncio
async def test_get_completion_response_forwards_native_tool_calling_params(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
    provider = DummyProvider(response={"content": "", "tool_calls": []})
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

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
async def test_get_completion_response_normalizes_tool_calls(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
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
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

    result = await client.get_completion_response("model", [])

    assert result["content"] == ""
    assert result["tool_calls"][0]["id"] == "call_1"
    assert result["tool_calls"][0]["name"] == "read_file"
    assert result["tool_calls"][0]["arguments"]["path"] == "/tmp/a.txt"
    assert result["finish_reason"] == "tool_calls"


@pytest.mark.asyncio
async def test_native_tool_calling_params_and_tool_calls_always_preserved(monkeypatch):
    cfg = AppConfig()
    client = LiteLLMClient(cfg)
    provider = DummyProvider(
        response={
            "content": "",
            "tool_calls": [{"id": "call_1", "name": "read_file", "arguments": {}}],
        },
        stream_events=[ChunkEvent(content="ok")],
    )
    monkeypatch.setattr("backend.src.llm.client.get_provider", lambda *_: provider)

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
