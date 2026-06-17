"""Covers sidecar user-data path helpers."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core import user_data_paths  # noqa: E402


def test_app_user_data_root_unsupported_os_uses_generic_error(monkeypatch):
    monkeypatch.setattr(user_data_paths.os, "name", "plan9")

    try:
        user_data_paths.app_user_data_root()
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected unsupported OS to raise")

    assert "sidecar user-data path" in message
    assert "WindieOS" not in message
