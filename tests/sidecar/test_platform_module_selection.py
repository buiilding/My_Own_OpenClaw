"""Covers local-runtime platform module selection behavior."""

import importlib
import platform
import sys
from types import ModuleType

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()


def _module(name: str, **attrs) -> ModuleType:
    mod = ModuleType(name)
    for key, value in attrs.items():
        setattr(mod, key, value)
    return mod


def _reload_window_manager_module(monkeypatch, os_name: str):
    class _WindowsWM:  # noqa: D401
        pass

    class _MacOSWM:  # noqa: D401
        pass

    class _LinuxWM:  # noqa: D401
        pass

    class _BaseWM:  # noqa: D401
        pass

    monkeypatch.setitem(
        sys.modules, "core.platform.windows", _module("core.platform.windows", WindowsWindowManager=_WindowsWM)
    )
    monkeypatch.setitem(
        sys.modules, "core.platform.macos", _module("core.platform.macos", MacOSWindowManager=_MacOSWM)
    )
    monkeypatch.setitem(
        sys.modules, "core.platform.linux", _module("core.platform.linux", LinuxWindowManager=_LinuxWM)
    )
    monkeypatch.setitem(
        sys.modules, "core.platform.base", _module("core.platform.base", BaseWindowManager=_BaseWM)
    )
    monkeypatch.setattr(platform, "system", lambda: os_name)

    import core.platform.window_manager as window_manager_module  # noqa: WPS433

    return importlib.reload(window_manager_module), _WindowsWM, _MacOSWM, _LinuxWM, _BaseWM


def test_window_manager_module_selects_windows_manager(monkeypatch):
    window_manager_module, windows_cls, _mac_cls, _linux_cls, _base_cls = (
        _reload_window_manager_module(monkeypatch, "Windows")
    )

    assert window_manager_module.IS_WINDOWS is True
    assert window_manager_module.IS_MACOS is False
    assert window_manager_module.IS_LINUX is False
    assert window_manager_module.WindowManager is windows_cls


def test_window_manager_module_selects_macos_manager(monkeypatch):
    window_manager_module, _windows_cls, mac_cls, _linux_cls, _base_cls = (
        _reload_window_manager_module(monkeypatch, "Darwin")
    )

    assert window_manager_module.IS_WINDOWS is False
    assert window_manager_module.IS_MACOS is True
    assert window_manager_module.IS_LINUX is False
    assert window_manager_module.WindowManager is mac_cls


def test_window_manager_module_selects_linux_manager(monkeypatch):
    window_manager_module, _windows_cls, _mac_cls, linux_cls, _base_cls = (
        _reload_window_manager_module(monkeypatch, "Linux")
    )

    assert window_manager_module.IS_WINDOWS is False
    assert window_manager_module.IS_MACOS is False
    assert window_manager_module.IS_LINUX is True
    assert window_manager_module.WindowManager is linux_cls


def test_window_manager_module_falls_back_to_base_manager_for_unsupported_os(monkeypatch):
    window_manager_module, _windows_cls, _mac_cls, _linux_cls, base_cls = (
        _reload_window_manager_module(monkeypatch, "Plan9")
    )

    assert window_manager_module.IS_WINDOWS is False
    assert window_manager_module.IS_MACOS is False
    assert window_manager_module.IS_LINUX is False
    assert window_manager_module.WindowManager is base_cls
