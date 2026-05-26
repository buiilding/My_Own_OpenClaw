from types import SimpleNamespace

import pytest

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
