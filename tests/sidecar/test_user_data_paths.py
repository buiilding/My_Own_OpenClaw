"""Covers local-runtime user-data path helpers."""

from pathlib import Path

import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core import user_data_paths  # noqa: E402


def test_app_user_data_root_supports_explicit_override(tmp_path: Path):
    assert user_data_paths.app_user_data_root(
        env={"WINDIE_USER_DATA_DIR": str(tmp_path)},
        override_env_key="WINDIE_USER_DATA_DIR",
    ) == tmp_path


def test_app_user_data_root_keeps_linux_default_unless_xdg_is_requested(
    monkeypatch,
    tmp_path: Path,
):
    home_dir = tmp_path / "home"
    monkeypatch.setattr(user_data_paths.Path, "home", classmethod(lambda _cls: home_dir))

    assert user_data_paths.app_user_data_root(
        env={"XDG_CONFIG_HOME": str(tmp_path / "xdg")},
        platform_name="linux",
    ) == home_dir / ".config" / "desktop-runtime"
    assert user_data_paths.app_user_data_root(
        env={"XDG_CONFIG_HOME": str(tmp_path / "xdg")},
        platform_name="linux",
        honor_xdg_config_home=True,
    ) == tmp_path / "xdg" / "desktop-runtime"


def test_app_user_data_root_windows_fallback_is_opt_in(monkeypatch, tmp_path: Path):
    home_dir = tmp_path / "home"
    monkeypatch.setattr(user_data_paths.Path, "home", classmethod(lambda _cls: home_dir))

    with pytest.raises(RuntimeError, match="APPDATA"):
        user_data_paths.app_user_data_root(env={}, platform_name="win32")

    assert user_data_paths.app_user_data_root(
        env={},
        platform_name="win32",
        allow_windows_home_fallback=True,
    ) == home_dir / "AppData" / "Roaming" / "desktop-runtime"


def test_app_user_data_root_unsupported_os_uses_generic_error(monkeypatch):
    monkeypatch.setattr(user_data_paths.os, "name", "plan9")

    try:
        user_data_paths.app_user_data_root()
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected unsupported OS to raise")

    assert "local-runtime user-data path" in message
    assert "Windie" "OS" not in message


def test_user_data_path_source_uses_local_runtime_terms():
    source = Path(user_data_paths.__file__).read_text(encoding="utf-8")

    assert "Python local-runtime storage" in source
    assert "sidecar-owned local storage" not in source
    assert "sidecar user-data path" not in source
