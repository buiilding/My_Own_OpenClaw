from backend.src.core.config.models import AppConfig
from backend.src.core.container.factories import (
    _create_embedder,
    _create_ocr_service,
    _create_vision_service,
)


def test_create_embedder_returns_none_for_non_local_backend() -> None:
    config = AppConfig(embedding_backend="remote-http")

    assert _create_embedder(config, cache_manager=None) is None


def test_create_ocr_service_returns_none_for_non_local_backend() -> None:
    config = AppConfig(ocr_backend="vendor")

    assert _create_ocr_service(config) is None


def test_create_vision_service_returns_none_for_non_local_backend() -> None:
    config = AppConfig(vision_backend="remote-http")

    assert _create_vision_service(config) is None
