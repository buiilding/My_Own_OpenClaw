import asyncio
import threading
from typing import Any

from backend.src.core.bootstrap.coordinator import InitializationCoordinator


class BlockingInitializationCoordinator(InitializationCoordinator):
    def __init__(self, started: threading.Event, release: threading.Event):
        super().__init__()
        self.started = started
        self.release = release

    async def _initialize_configuration(self, config_manager=None) -> None:
        self.started.set()
        await asyncio.to_thread(self.release.wait, 2)
        self.config_manager = object()

    async def _initialize_container(self) -> None:
        self.container = object()

    async def _initialize_services(self) -> None:
        self.session_manager = object()

    def _validate_final_state(self) -> None:
        return None


def test_initialize_rejects_cross_thread_concurrent_call_deterministically():
    started = threading.Event()
    release = threading.Event()
    coordinator = BlockingInitializationCoordinator(started, release)
    results: list[tuple[str, Any]] = []
    results_lock = threading.Lock()

    def run_initialize(label: str) -> None:
        try:
            value = asyncio.run(coordinator.initialize())
        except Exception as exc:
            with results_lock:
                results.append((label, exc))
        else:
            with results_lock:
                results.append((label, value))

    first = threading.Thread(target=run_initialize, args=("first",))
    first.start()
    assert started.wait(timeout=2)

    second = threading.Thread(target=run_initialize, args=("second",))
    second.start()
    second.join(timeout=2)
    release.set()
    first.join(timeout=2)

    assert len(results) == 2
    successes = [value for _, value in results if not isinstance(value, Exception)]
    failures = [value for _, value in results if isinstance(value, Exception)]

    assert len(successes) == 1
    assert len(failures) == 1
    assert isinstance(failures[0], RuntimeError)
    assert "initialization already in progress" in str(failures[0])
    assert "bound to a different event loop" not in str(failures[0])
    assert coordinator.is_initialized is True
