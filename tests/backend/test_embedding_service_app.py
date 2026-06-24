"""Covers embedding service app behavior in the backend test suite."""

from fastapi.testclient import TestClient
import pytest

from backend.src.core.config.models import AppConfig
from backend.src.embeddings import service_app


class FakeEmbeddingProvider:
    provider_id = "fake-embedding"
    model_id = "fake-model"
    model_name = "Fake Model"
    dimension = 2

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def embed_batch(self, texts: list[str]):
        self.calls.append(texts)
        return [[float(index), float(index + 1)] for index, _text in enumerate(texts)]


class BrokenHealthEmbeddingProvider(FakeEmbeddingProvider):
    @property
    def model_id(self) -> str:
        raise RuntimeError("model metadata unavailable")


class LifecycleEmbeddingProvider(FakeEmbeddingProvider):
    def __init__(self) -> None:
        super().__init__()
        self.initialized = False
        self.closed = False

    async def initialize(self) -> None:
        self.initialized = True

    async def close(self) -> None:
        self.closed = True


def _auth_headers(token: str = "test-embedding-key") -> dict[str, str]:
    return {service_app.EMBEDDING_SERVICE_API_KEY_HEADER: token}


@pytest.mark.asyncio
async def test_lifespan_uses_backend_app_config(monkeypatch) -> None:
    configured = AppConfig(
        embedding_model="sentence-transformers/all-MiniLM-L6-v2",
        embedding_max_concurrent_requests=2,
        embedding_queue_timeout_seconds=10.0,
    )
    provider = LifecycleEmbeddingProvider()
    built_configs: list[AppConfig] = []

    monkeypatch.setattr(service_app, "load_settings_from_file", lambda: configured)

    def build_provider(config: AppConfig):
        built_configs.append(config)
        return provider

    monkeypatch.setattr(service_app, "_build_provider", build_provider)

    async with service_app.lifespan(service_app.app):
        assert service_app.app.state.config is configured
        assert service_app.app.state.embedding_provider is provider
        assert provider.initialized is True

    assert built_configs == [configured]
    assert provider.closed is True


def test_health_returns_provider_metadata() -> None:
    service_app.app.state.embedding_provider = FakeEmbeddingProvider()
    client = TestClient(service_app.app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "provider_id": "fake-embedding",
        "model_id": "fake-model",
        "model_name": "Fake Model",
        "dimension": 2,
        "embedding_space_version": "fake-embedding:fake-model:2",
    }


def test_health_returns_503_when_provider_is_missing() -> None:
    if hasattr(service_app.app.state, "embedding_provider"):
        delattr(service_app.app.state, "embedding_provider")
    client = TestClient(service_app.app)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"detail": "Embedding provider not available"}


def test_health_returns_503_when_provider_metadata_fails() -> None:
    service_app.app.state.embedding_provider = BrokenHealthEmbeddingProvider()
    client = TestClient(service_app.app, raise_server_exceptions=False)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"detail": "Embedding service unhealthy"}


def test_embed_requires_configured_service_api_key(monkeypatch) -> None:
    monkeypatch.delenv(service_app.EMBEDDING_SERVICE_API_KEY_ENV, raising=False)
    provider = FakeEmbeddingProvider()
    service_app.app.state.embedding_provider = provider
    client = TestClient(service_app.app)

    response = client.post("/embed", json={"texts": ["hello"]})

    assert response.status_code == 503
    assert provider.calls == []


def test_embed_rejects_missing_service_api_key(monkeypatch) -> None:
    monkeypatch.setenv(service_app.EMBEDDING_SERVICE_API_KEY_ENV, "test-embedding-key")
    provider = FakeEmbeddingProvider()
    service_app.app.state.embedding_provider = provider
    client = TestClient(service_app.app)

    response = client.post("/embed", json={"texts": ["hello"]})

    assert response.status_code == 401
    assert provider.calls == []


def test_embed_rejects_invalid_service_api_key(monkeypatch) -> None:
    monkeypatch.setenv(service_app.EMBEDDING_SERVICE_API_KEY_ENV, "test-embedding-key")
    provider = FakeEmbeddingProvider()
    service_app.app.state.embedding_provider = provider
    client = TestClient(service_app.app)

    response = client.post(
        "/embed",
        json={"texts": ["hello"]},
        headers=_auth_headers("wrong-key"),
    )

    assert response.status_code == 403
    assert provider.calls == []


def test_embed_accepts_normal_batch(monkeypatch) -> None:
    monkeypatch.setenv(service_app.EMBEDDING_SERVICE_API_KEY_ENV, "test-embedding-key")
    provider = FakeEmbeddingProvider()
    service_app.app.state.embedding_provider = provider
    client = TestClient(service_app.app)

    response = client.post(
        "/embed",
        json={"texts": ["hello", "world"]},
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    assert provider.calls == [["hello", "world"]]
    body = response.json()
    assert body["embeddings"] == [[0.0, 1.0], [1.0, 2.0]]
    assert body["provider_id"] == "fake-embedding"
    assert body["dimension"] == 2


def test_embed_rejects_overlong_text_before_provider_call(monkeypatch) -> None:
    monkeypatch.setenv(service_app.EMBEDDING_SERVICE_API_KEY_ENV, "test-embedding-key")
    provider = FakeEmbeddingProvider()
    service_app.app.state.embedding_provider = provider
    client = TestClient(service_app.app)

    response = client.post(
        "/embed",
        json={"texts": ["x" * (service_app.MAX_EMBED_TEXT_CHARS + 1)]},
        headers=_auth_headers(),
    )

    assert response.status_code == 422
    assert provider.calls == []


def test_embed_rejects_over_budget_batch_before_provider_call(monkeypatch) -> None:
    monkeypatch.setenv(service_app.EMBEDDING_SERVICE_API_KEY_ENV, "test-embedding-key")
    provider = FakeEmbeddingProvider()
    service_app.app.state.embedding_provider = provider
    client = TestClient(service_app.app)

    response = client.post(
        "/embed",
        json={"texts": ["x" * 4096 for _index in range(17)]},
        headers=_auth_headers(),
    )

    assert response.status_code == 422
    assert provider.calls == []
