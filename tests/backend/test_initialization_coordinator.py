"""Covers initialization coordinator behavior in the backend test suite."""

from types import SimpleNamespace

import pytest

import backend.src.core.bootstrap.coordinator as coordinator_module
from backend.src.llm.prompts.prompts import PromptManager
from backend.src.core.bootstrap.coordinator import (
    InitializationCoordinator,
    InitializationError,
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failing_phase", "failing_method"),
    [
        ("configuration", "_initialize_configuration"),
        ("container", "_initialize_container"),
        ("services", "_initialize_services"),
    ],
)
async def test_initialize_reports_actual_failing_phase(
    monkeypatch,
    failing_phase,
    failing_method,
) -> None:
    coordinator = InitializationCoordinator()

    async def configuration_ok(_config_manager=None):
        coordinator.config_manager = SimpleNamespace()

    async def container_ok():
        coordinator.container = SimpleNamespace()

    async def services_ok():
        coordinator.session_manager = SimpleNamespace()

    async def fail(*_args, **_kwargs):
        raise RuntimeError(f"{failing_phase} exploded")

    async def rollback_noop():
        return None

    monkeypatch.setattr(coordinator, "_initialize_configuration", configuration_ok)
    monkeypatch.setattr(coordinator, "_initialize_container", container_ok)
    monkeypatch.setattr(coordinator, "_initialize_services", services_ok)
    monkeypatch.setattr(coordinator, failing_method, fail)
    monkeypatch.setattr(coordinator, "_rollback", rollback_noop)

    with pytest.raises(InitializationError) as exc_info:
        await coordinator.initialize()

    assert str(exc_info.value) == (
        f"Initialization failed at phase '{failing_phase}': "
        f"{failing_phase} exploded"
    )


@pytest.mark.asyncio
async def test_services_phase_initializes_prompt_manager_from_owner_module(
    monkeypatch,
) -> None:
    coordinator = InitializationCoordinator()
    session_manager = SimpleNamespace()
    subscribed = []
    handler_calls = []
    prompt_initialized = []

    class FakeConfigService:
        def subscribe(self, listener):
            subscribed.append(listener)

    class FakeHandlerInitializer:
        async def initialize(self, container):
            handler_calls.append(container)

    def initialize_prompt_manager(self):
        assert isinstance(self, PromptManager)
        prompt_initialized.append(True)

    container = SimpleNamespace(
        session_manager=session_manager,
        config_service=FakeConfigService(),
    )
    coordinator.container = container

    monkeypatch.setattr(PromptManager, "initialize", initialize_prompt_manager)
    monkeypatch.setattr(
        coordinator_module,
        "HandlerInitializer",
        FakeHandlerInitializer,
    )

    await coordinator._initialize_services()

    assert prompt_initialized == [True]
    assert subscribed == [session_manager]
    assert handler_calls == [container]
