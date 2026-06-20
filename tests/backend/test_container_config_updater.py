"""Covers container config updater behavior in the backend test suite."""

from types import SimpleNamespace

import pytest
from dependency_injector import providers

import backend.src.core.container.core_container as core_container
from backend.src.core.config.manager import ConfigManager
from backend.src.core.config.models import AppConfig
from backend.src.core.container.config_updater import ContainerConfigUpdater
from backend.src.core.container.facade import Container


def test_reinitialize_embedder_rebinds_embedding_router(monkeypatch) -> None:
    config = AppConfig(
        provider_circuit_breaker_failure_threshold=7,
        provider_circuit_breaker_cooldown_seconds=42.0,
    )
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
        embedding_router=SimpleNamespace(
            configure_circuit_breaker=lambda **kwargs: captured.setdefault(
                "circuit_breaker", kwargs
            ),
            set_provider=set_provider,
        ),
        embedding_provider=None,
    )
    updater = ContainerConfigUpdater(container)

    updater._reinitialize_embedder(config)

    assert captured["provider"] is new_provider
    assert captured["circuit_breaker"] == {
        "failure_threshold": 7,
        "cooldown_seconds": 42.0,
    }
    assert container.embedding_provider is new_provider


@pytest.mark.asyncio
async def test_update_config_rebinds_di_config_consumers(monkeypatch) -> None:
    initial_config = AppConfig(
        llm_timeout=111,
        memory_enabled=False,
        ocr_backend="disabled",
        vision_backend="disabled",
        tts_model_path="/tmp/project-alpha-test-tts-initial",
    )
    config_manager = ConfigManager()
    config_manager._config = initial_config
    container = Container(config_manager=config_manager)
    container.config_service.initialize()

    captured_llm_configs = []

    def fake_get_llm_client(config):
        captured_llm_configs.append(config)
        return SimpleNamespace(config=config)

    monkeypatch.setattr(core_container, "get_llm_client", fake_get_llm_client)

    await container.update_config(
        initial_config.model_copy(
            update={
                "llm_timeout": 222,
                "tts_model_path": "/tmp/project-alpha-test-tts-updated",
            }
        )
    )

    updated_config = config_manager.get_config()
    assert container.config is updated_config
    assert container._di_container.config() is updated_config
    assert container._di_container.core.config() is updated_config
    assert container.llm_client.config is updated_config
    assert captured_llm_configs[-1] is updated_config
    tool_orchestrator = container._di_container.tool_orchestrator()
    assert tool_orchestrator.tool_registry.config is updated_config
    assert tool_orchestrator.context_factory.config is updated_config
    assert container.model_service.config is updated_config


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
            set_ocr_router=lambda router: captured.setdefault("service", router)
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
