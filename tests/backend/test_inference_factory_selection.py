"""Covers inference factory selection behavior in the backend test suite."""

from backend.src.core.config.models import AppConfig
from backend.src.core.container.factories import (
    _create_embedder,
    _create_ocr_provider,
    _create_ocr_service,
    _create_vision_provider,
    _create_vision_service,
)
from backend.src.embeddings.openai_provider import OpenAIEmbeddingProvider
from backend.src.embeddings.remote_provider import RemoteHttpEmbeddingProvider
from backend.src.services.ocr.remote_provider import RemoteHttpOcrProvider
from backend.src.services.vision import RemoteHttpVisionProvider


def test_create_embedder_returns_remote_http_provider() -> None:
    config = AppConfig(
        embedding_backend="remote-http",
        embedding_remote_service_url="http://embeddings.internal",
    )

    provider = _create_embedder(config, cache_manager=None)

    assert provider is not None
    assert isinstance(provider.provider, RemoteHttpEmbeddingProvider)
    assert provider.model_id == "text-embedding-3-small"


def test_create_embedder_returns_vendor_openai_provider(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    config = AppConfig(
        embedding_backend="vendor",
        embedding_model="text-embedding-3-small",
    )

    provider = _create_embedder(config, cache_manager=None)

    assert provider is not None
    assert isinstance(provider.provider, OpenAIEmbeddingProvider)
    assert provider.provider_id == "openai"
    assert provider.model_id == "text-embedding-3-small"


def test_create_embedder_returns_none_for_disabled_backend() -> None:
    assert (
        _create_embedder(AppConfig(embedding_backend="disabled"), cache_manager=None)
        is None
    )


def test_create_ocr_service_returns_none_for_non_local_backend() -> None:
    config = AppConfig(ocr_backend="vendor")

    assert _create_ocr_service(config) is None


def test_create_vision_service_returns_none_for_non_local_backend() -> None:
    config = AppConfig(vision_backend="remote-http")

    assert _create_vision_service(config) is None


def test_create_ocr_provider_returns_remote_http_provider() -> None:
    config = AppConfig(
        ocr_backend="remote-http",
        ocr_remote_service_url="http://ocr.internal",
    )

    provider = _create_ocr_provider(config)

    assert isinstance(provider, RemoteHttpOcrProvider)
    assert provider.model_id == "rapidocr-ppocrv5-server"


def test_create_vision_provider_returns_remote_http_provider() -> None:
    config = AppConfig(
        vision_backend="remote-http",
        vision_remote_service_url="http://vision.internal",
        vision_model_name="remote-vision-model",
    )

    provider = _create_vision_provider(config)

    assert isinstance(provider, RemoteHttpVisionProvider)
    assert provider.model_id == "remote-vision-model"


def test_create_disabled_ocr_and_vision_providers_return_none() -> None:
    assert _create_ocr_provider(AppConfig(ocr_backend="disabled")) is None
    assert _create_vision_provider(AppConfig(vision_backend="disabled")) is None
