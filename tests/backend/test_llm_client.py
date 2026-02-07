import pytest

from backend.src.core.config.models import AppConfig
from backend.src.core.events.streaming_events import ErrorEvent, ChunkEvent
from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.llm.client import LiteLLMClient


class DummyProvider:
    def __init__(self, response=None, stream_events=None):
        self.response = response
        self.stream_events = stream_events or []

    async def get_completion(self, model, messages):
        return self.response

    async def get_completion_stream(self, model, messages):
        for event in self.stream_events:
            yield event


class FailingStreamProvider:
    async def get_completion(self, model, messages):
        return {"content": "ok"}

    async def get_completion_stream(self, model, messages):
        raise RuntimeError("stream exploded")
        yield ChunkEvent(content="never")  # pragma: no cover


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
