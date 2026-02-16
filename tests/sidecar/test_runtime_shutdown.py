import logging
import signal
import sys
from pathlib import Path


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from core import runtime_shutdown as runtime_shutdown_module  # noqa: E402


class DummyService:
    def __init__(self):
        self._shutdown_requested = False
        self.running = True
        self.signals = []

    def request_shutdown(self, signum):
        self.signals.append(signum)


def test_request_stdin_shutdown_marks_service_and_closes_open_stdin(monkeypatch):
    service = DummyService()
    logger = logging.getLogger("test.runtime_shutdown")

    class DummyStdin:
        def __init__(self):
            self.closed = False
            self.close_calls = 0

        def close(self):
            self.closed = True
            self.close_calls += 1

    stdin = DummyStdin()
    monkeypatch.setattr(runtime_shutdown_module.sys, "stdin", stdin)

    runtime_shutdown_module.request_stdin_shutdown(service, logger, signal.SIGTERM)

    assert service._shutdown_requested is True
    assert service.running is False
    assert stdin.close_calls == 1
    assert stdin.closed is True


def test_request_stdin_shutdown_is_idempotent(monkeypatch):
    service = DummyService()
    logger = logging.getLogger("test.runtime_shutdown")

    class DummyStdin:
        def __init__(self):
            self.closed = False
            self.close_calls = 0

        def close(self):
            self.closed = True
            self.close_calls += 1

    stdin = DummyStdin()
    monkeypatch.setattr(runtime_shutdown_module.sys, "stdin", stdin)

    runtime_shutdown_module.request_stdin_shutdown(service, logger, signal.SIGTERM)
    runtime_shutdown_module.request_stdin_shutdown(service, logger, signal.SIGTERM)

    assert stdin.close_calls == 1


def test_handle_shutdown_signal_forwards_to_active_service():
    service = DummyService()
    logger = logging.getLogger("test.runtime_shutdown")

    handled = runtime_shutdown_module.handle_shutdown_signal(signal.SIGINT, service, logger)

    assert handled is True
    assert service.signals == [signal.SIGINT]


def test_handle_shutdown_signal_without_active_service():
    logger = logging.getLogger("test.runtime_shutdown")

    handled = runtime_shutdown_module.handle_shutdown_signal(signal.SIGINT, None, logger)

    assert handled is False


def test_register_shutdown_signal_handlers_registers_sigint_and_sigterm(monkeypatch):
    calls = []

    def fake_signal(sig, handler):
        calls.append((sig, handler))

    def handler(signum, frame):
        return None

    monkeypatch.setattr(runtime_shutdown_module.signal, "signal", fake_signal)

    runtime_shutdown_module.register_shutdown_signal_handlers(handler)

    assert calls == [(signal.SIGINT, handler), (signal.SIGTERM, handler)]
