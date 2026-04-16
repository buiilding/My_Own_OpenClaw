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
        embedder=None,
    )
    updater = ContainerConfigUpdater(container)

    updater._reinitialize_embedder(config)

    assert captured["provider"] is new_provider
    assert container.embedding_provider is new_provider
    assert container.embedder is container.embedding_router
