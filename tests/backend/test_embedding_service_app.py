from fastapi.testclient import TestClient

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


def _auth_headers(token: str = "test-embedding-key") -> dict[str, str]:
    return {service_app.EMBEDDING_SERVICE_API_KEY_HEADER: token}


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
