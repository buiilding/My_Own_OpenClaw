import asyncio
from unittest.mock import AsyncMock

import pytest

from backend.src.llm.providers.local import (
    LOCAL_PROVIDER_PLACEHOLDER_API_KEY,
    LocalLLMProvider,
    LMStudioProvider,
    OllamaProvider,
)


class DummyResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


@pytest.mark.asyncio
async def test_ollama_list_models_uses_root_tags_endpoint(monkeypatch):
    provider = OllamaProvider(base_url="http://localhost:11434/v1")
    response = DummyResponse(200, {"models": [{"name": "llama3:latest"}]})
    get_mock = AsyncMock(return_value=response)
    monkeypatch.setattr(provider, "_get_http_client", AsyncMock(return_value=type("Client", (), {"get": get_mock})()))

    models = await provider.list_models()

    get_mock.assert_awaited_once_with("http://localhost:11434/api/tags")
    assert models == [
        {"id": "llama3:latest", "provider": "ollama", "display_name": "llama3:latest"}
    ]


@pytest.mark.asyncio
async def test_ollama_list_models_returns_empty_on_non_200(monkeypatch):
    provider = OllamaProvider(base_url="http://localhost:11434/v1")
    response = DummyResponse(503, {"error": "unavailable"})
    get_mock = AsyncMock(return_value=response)
    monkeypatch.setattr(provider, "_get_http_client", AsyncMock(return_value=type("Client", (), {"get": get_mock})()))

    assert await provider.list_models() == []


@pytest.mark.asyncio
async def test_ollama_list_models_handles_non_list_models_field(monkeypatch):
    provider = OllamaProvider(base_url="http://localhost:11434/v1")
    response = DummyResponse(200, {"models": {"name": "not-a-list"}})
    get_mock = AsyncMock(return_value=response)
    monkeypatch.setattr(provider, "_get_http_client", AsyncMock(return_value=type("Client", (), {"get": get_mock})()))

    assert await provider.list_models() == []


@pytest.mark.asyncio
async def test_ollama_list_models_uses_default_host_for_v1_only_base_url(monkeypatch):
    provider = OllamaProvider(base_url="/v1")
    response = DummyResponse(200, {"models": []})
    get_mock = AsyncMock(return_value=response)
    monkeypatch.setattr(provider, "_get_http_client", AsyncMock(return_value=type("Client", (), {"get": get_mock})()))

    await provider.list_models()

    get_mock.assert_awaited_once_with("http://localhost:11434/api/tags")


@pytest.mark.asyncio
async def test_lmstudio_list_models_handles_non_list_payload(monkeypatch):
    provider = LMStudioProvider(base_url="http://localhost:1234/v1")
    response = DummyResponse(200, {"data": {"id": "should-be-list"}})
    get_mock = AsyncMock(return_value=response)
    monkeypatch.setattr(provider, "_get_http_client", AsyncMock(return_value=type("Client", (), {"get": get_mock})()))

    assert await provider.list_models() == []


@pytest.mark.asyncio
async def test_lmstudio_list_models_returns_models(monkeypatch):
    provider = LMStudioProvider(base_url="http://localhost:1234/v1")
    response = DummyResponse(200, {"data": [{"id": "model-a"}, {"id": "model-b"}]})
    get_mock = AsyncMock(return_value=response)
    monkeypatch.setattr(provider, "_get_http_client", AsyncMock(return_value=type("Client", (), {"get": get_mock})()))

    models = await provider.list_models()

    get_mock.assert_awaited_once_with("http://localhost:1234/v1/models")
    assert models == [
        {"id": "model-a", "provider": "lmstudio", "display_name": "model-a"},
        {"id": "model-b", "provider": "lmstudio", "display_name": "model-b"},
    ]


@pytest.mark.asyncio
async def test_ollama_list_models_filters_invalid_rows(monkeypatch):
    provider = OllamaProvider(base_url="http://localhost:11434/v1")
    response = DummyResponse(
        200,
        {"models": [{"name": "ok-model"}, {"name": ""}, {"name": None}, "bad-row"]},
    )
    get_mock = AsyncMock(return_value=response)
    monkeypatch.setattr(
        provider,
        "_get_http_client",
        AsyncMock(return_value=type("Client", (), {"get": get_mock})()),
    )

    models = await provider.list_models()

    assert models == [
        {"id": "ok-model", "provider": "ollama", "display_name": "ok-model"},
    ]


def test_normalize_listed_models_returns_empty_for_non_list_payload():
    assert (
        LocalLLMProvider._normalize_listed_models(
            {"id": "not-a-list"},
            model_id_key="id",
            provider_name="lmstudio",
        )
        == []
    )


def test_local_provider_request_params_set_placeholder_api_key():
    provider = OllamaProvider(base_url="http://localhost:11434/v1")
    params = provider._build_request_params("llama3", [{"role": "user", "content": "hi"}])

    assert params["custom_llm_provider"] == "openai"
    assert params["api_key"] == LOCAL_PROVIDER_PLACEHOLDER_API_KEY


def test_ollama_build_tags_url_helper():
    assert OllamaProvider._build_tags_url("http://localhost:11434/v1") == "http://localhost:11434/api/tags"
    assert OllamaProvider._build_tags_url("http://localhost:11434") == "http://localhost:11434/api/tags"
    assert OllamaProvider._build_tags_url("/v1") == "http://localhost:11434/api/tags"
    assert OllamaProvider._build_tags_url("/") is None


@pytest.mark.asyncio
async def test_get_http_client_creates_single_client_under_concurrency(monkeypatch):
    provider = OllamaProvider(base_url="http://localhost:11434/v1")
    created_clients = []

    class DummyClient:
        async def aclose(self):
            return None

    def fake_async_client(*_args, **_kwargs):
        client = DummyClient()
        created_clients.append(client)
        return client

    monkeypatch.setattr("backend.src.llm.providers.local.httpx.AsyncClient", fake_async_client)

    clients = await asyncio.gather(*[provider._get_http_client() for _ in range(20)])

    assert len(created_clients) == 1
    assert len({id(client) for client in clients}) == 1
