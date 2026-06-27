"""Covers local-runtime stdout JSON framing behavior."""

import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core import stdout_json as stdout_json_module  # noqa: E402


def test_stdout_json_module_doc_uses_local_runtime_wording():
    assert "local-runtime stdout protocols" in (stdout_json_module.__doc__ or "")
    assert "sidecar stdout protocols" not in (stdout_json_module.__doc__ or "")


def _install_dummy_stdout(monkeypatch, *, write_error: Exception | None = None):
    class DummyBuffer:
        def __init__(self):
            self.writes = []
            self.flush_calls = 0

        def write(self, data):
            if write_error is not None:
                raise write_error
            self.writes.append(data)

        def flush(self):
            self.flush_calls += 1

    class DummyStdout:
        def __init__(self):
            self.buffer = DummyBuffer()

    dummy_stdout = DummyStdout()
    monkeypatch.setattr(stdout_json_module.sys, "stdout", dummy_stdout)
    return dummy_stdout


def test_write_json_line_writes_utf8_json_with_newline(monkeypatch):
    dummy_stdout = _install_dummy_stdout(monkeypatch)

    stdout_json_module.write_json_line({"message": "héllo"})

    assert dummy_stdout.buffer.writes == [b'{"message": "h\xc3\xa9llo"}\n']
    assert dummy_stdout.buffer.flush_calls == 1


def test_write_json_line_supports_array_payloads(monkeypatch):
    dummy_stdout = _install_dummy_stdout(monkeypatch)

    stdout_json_module.write_json_line(["ok", {"value": 1}])

    assert dummy_stdout.buffer.writes == [b'["ok", {"value": 1}]\n']
    assert dummy_stdout.buffer.flush_calls == 1


def test_write_json_line_replaces_lone_surrogates(monkeypatch):
    dummy_stdout = _install_dummy_stdout(monkeypatch)

    stdout_json_module.write_json_line({"text": "bad\udc9dtitle"})

    assert dummy_stdout.buffer.writes == ['{"text": "bad�title"}\n'.encode("utf-8")]
    assert dummy_stdout.buffer.flush_calls == 1


def test_write_json_line_propagates_buffer_errors(monkeypatch):
    dummy_stdout = _install_dummy_stdout(monkeypatch, write_error=OSError("broken pipe"))

    try:
        stdout_json_module.write_json_line({"message": "x"})
    except OSError as exc:
        assert str(exc) == "broken pipe"
    else:
        raise AssertionError("Expected OSError to propagate")

    assert dummy_stdout.buffer.flush_calls == 0


def test_write_json_line_propagates_json_encoding_errors(monkeypatch):
    dummy_stdout = _install_dummy_stdout(monkeypatch)

    with pytest.raises(TypeError):
        stdout_json_module.write_json_line({"bad": {1, 2}})

    assert dummy_stdout.buffer.writes == []
    assert dummy_stdout.buffer.flush_calls == 0
