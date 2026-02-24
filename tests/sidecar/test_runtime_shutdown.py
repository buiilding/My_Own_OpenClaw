import logging
import signal
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core import runtime_shutdown as runtime_shutdown_module  # noqa: E402


class DummyService:
    def __init__(self):
        self._shutdown_requested = False
        self.running = True
        self.signals = []

    def request_shutdown(self, signum):
        self.signals.append(signum)


class DummyTrackableStdin:
    def __init__(self, closed=False):
        self.closed = closed
        self.close_calls = 0

    def close(self):
        self.closed = True
        self.close_calls += 1


def _service_logger_with_stdin(monkeypatch, stdin):
    service = DummyService()
    logger = logging.getLogger("test.runtime_shutdown")
    monkeypatch.setattr(runtime_shutdown_module.sys, "stdin", stdin)
    return service, logger


def test_request_stdin_shutdown_marks_service_and_closes_open_stdin(monkeypatch):
    stdin = DummyTrackableStdin()
    service, logger = _service_logger_with_stdin(monkeypatch, stdin)

    runtime_shutdown_module.request_stdin_shutdown(service, logger, signal.SIGTERM)

    assert service._shutdown_requested is True
    assert service.running is False
    assert stdin.close_calls == 1
    assert stdin.closed is True


def test_request_stdin_shutdown_is_idempotent(monkeypatch):
    stdin = DummyTrackableStdin()
    service, logger = _service_logger_with_stdin(monkeypatch, stdin)

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


def test_request_stdin_shutdown_with_no_stdin_object(monkeypatch):
    service = DummyService()
    logger = logging.getLogger("test.runtime_shutdown")

    monkeypatch.setattr(runtime_shutdown_module.sys, "stdin", None)

    runtime_shutdown_module.request_stdin_shutdown(service, logger)

    assert service._shutdown_requested is True
    assert service.running is False


def test_request_stdin_shutdown_skips_when_stdin_already_closed(monkeypatch):
    service = DummyService()
    logger = logging.getLogger("test.runtime_shutdown")

    class DummyClosedStdin:
        closed = True
        close_calls = 0

        def close(self):
            self.close_calls += 1

    stdin = DummyClosedStdin()
    monkeypatch.setattr(runtime_shutdown_module.sys, "stdin", stdin)

    runtime_shutdown_module.request_stdin_shutdown(service, logger)

    assert stdin.close_calls == 0
    assert service._shutdown_requested is True


def test_request_stdin_shutdown_ignores_non_callable_close(monkeypatch):
    service = DummyService()
    logger = logging.getLogger("test.runtime_shutdown")

    class DummyStdin:
        closed = False
        close = "not-callable"

    monkeypatch.setattr(runtime_shutdown_module.sys, "stdin", DummyStdin())

    runtime_shutdown_module.request_stdin_shutdown(service, logger)

    assert service._shutdown_requested is True
    assert service.running is False


def test_request_stdin_shutdown_swallows_close_exceptions(monkeypatch):
    service = DummyService()
    logger = logging.getLogger("test.runtime_shutdown")

    class DummyStdin:
        closed = False

        def close(self):
            raise RuntimeError("cannot close")

    monkeypatch.setattr(runtime_shutdown_module.sys, "stdin", DummyStdin())

    runtime_shutdown_module.request_stdin_shutdown(service, logger)

    assert service._shutdown_requested is True
    assert service.running is False
