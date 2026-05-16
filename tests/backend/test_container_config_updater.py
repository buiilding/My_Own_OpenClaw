from types import SimpleNamespace

from dependency_injector import providers

from backend.src.core.config.models import AppConfig
from backend.src.core.container.config_updater import ContainerConfigUpdater


def test_reinitialize_embedder_rebinds_embedding_router(monkeypatch) -> None:
    config = AppConfig()
    new_provider = object()
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        "backend.src.core.container.config_updater._create_embedder",
        lambda config, cache_manager: new_provider,
    )

    def set_provider(provider) -> None:
        captured["provider"] = provider

    container = SimpleNamespace(
        _di_container=SimpleNamespace(
            embedder=providers.Singleton(lambda: "old-provider"),
            core=SimpleNamespace(cache_manager=lambda: "cache-manager"),
        ),
        embedding_router=SimpleNamespace(set_provider=set_provider),
        embedding_provider=None,
    )
    updater = ContainerConfigUpdater(container)

    updater._reinitialize_embedder(config)

    assert captured["provider"] is new_provider
    assert container.embedding_provider is new_provider


def test_reinitialize_ocr_provider_rebinds_router_and_context(monkeypatch) -> None:
    captured = {}

    monkeypatch.setattr(
        "backend.src.core.container.config_updater._create_ocr_service",
        lambda config: object(),
    )

    container = SimpleNamespace(
        _di_container=SimpleNamespace(
            core=SimpleNamespace(ocr_service=providers.Singleton(lambda: "old-ocr")),
        ),
        ocr_router=SimpleNamespace(
            configure_circuit_breaker=lambda **kwargs: captured.setdefault(
                "circuit_breaker", kwargs
            ),
            set_provider=lambda provider: captured.setdefault("provider", provider),
        ),
        ocr_provider=None,
        context_factory=SimpleNamespace(
            set_ocr_service=lambda service: captured.setdefault("service", service)
        ),
    )

    ContainerConfigUpdater(container)._reinitialize_ocr_provider(AppConfig())

    assert container.ocr_provider is not None
    assert captured["provider"] is container.ocr_provider
    assert captured["service"] is container.ocr_router


def test_reinitialize_vision_provider_rebinds_router_and_context(monkeypatch) -> None:
    captured = {}

    monkeypatch.setattr(
        "backend.src.core.container.config_updater._create_vision_service",
        lambda config: object(),
    )

    container = SimpleNamespace(
        _di_container=SimpleNamespace(
            core=SimpleNamespace(
                vision_service=providers.Singleton(lambda: "old-vision")
            ),
        ),
        vision_router=SimpleNamespace(
            configure_circuit_breaker=lambda **kwargs: captured.setdefault(
                "circuit_breaker", kwargs
            ),
            set_provider=lambda provider: captured.setdefault("provider", provider)
        ),
        vision_provider=None,
        context_factory=SimpleNamespace(
            set_vision_service=lambda service: captured.setdefault("service", service)
        ),
    )

    ContainerConfigUpdater(container)._reinitialize_vision_provider(AppConfig())

    assert container.vision_provider is not None
    assert captured["provider"] is container.vision_provider
    assert captured["service"] is container.vision_router
