from __future__ import annotations

import importlib.util
import inspect
import sys
import types
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_PYTHON = REPO_ROOT / "frontend" / "src" / "main" / "python"


def _module(name: str, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    return module


def _event_class(name: str):
    class Event:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    Event.__name__ = name
    return Event


def _load_navigation_runtime(monkeypatch):
    stubs = {
        "browser_use": _module("browser_use"),
        "browser_use.browser": _module("browser_use.browser"),
        "browser_use.browser.events": _module(
            "browser_use.browser.events",
            AgentFocusChangedEvent=_event_class("AgentFocusChangedEvent"),
            FileDownloadedEvent=_event_class("FileDownloadedEvent"),
            NavigateToUrlEvent=_event_class("NavigateToUrlEvent"),
            NavigationCompleteEvent=_event_class("NavigationCompleteEvent"),
            NavigationStartedEvent=_event_class("NavigationStartedEvent"),
            SwitchTabEvent=_event_class("SwitchTabEvent"),
            TabCreatedEvent=_event_class("TabCreatedEvent"),
            TabClosedEvent=_event_class("TabClosedEvent"),
        ),
        "browser_use.utils": _module(
            "browser_use.utils",
            is_new_tab_page=lambda url: url == "about:blank",
        ),
        "cdp_use": _module("cdp_use"),
        "cdp_use.cdp": _module("cdp_use.cdp"),
        "cdp_use.cdp.target": _module("cdp_use.cdp.target", TargetID=str),
    }
    for name, module in stubs.items():
        monkeypatch.setitem(sys.modules, name, module)

    module_name = "browser_use.browser.navigation_runtime"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(
        module_name,
        FRONTEND_PYTHON
        / "tools"
        / "browser"
        / "browser_use"
        / "browser"
        / "navigation_runtime.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _load_watchdog_supervisor():
    module_name = "browser_use.browser.watchdog_supervisor"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(
        module_name,
        FRONTEND_PYTHON
        / "tools"
        / "browser"
        / "browser_use"
        / "browser"
        / "watchdog_supervisor.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def test_navigation_runtime_owns_tab_and_download_lifecycle(monkeypatch):
    module = _load_navigation_runtime(monkeypatch)
    runtime_cls = module.BrowserSessionNavigationRuntime

    for method_name in [
        "on_NavigateToUrlEvent",
        "on_SwitchTabEvent",
        "on_TabCreatedEvent",
        "on_TabClosedEvent",
        "on_AgentFocusChangedEvent",
        "on_FileDownloadedEvent",
    ]:
        assert inspect.iscoroutinefunction(getattr(runtime_cls, method_name))


@pytest.mark.asyncio
async def test_watchdog_supervisor_owns_watchdog_reset_and_attachment_short_circuit():
    module = _load_watchdog_supervisor()
    session = types.SimpleNamespace(
        logger=types.SimpleNamespace(debug=lambda *_args, **_kwargs: None),
        _crash_watchdog=object(),
        _downloads_watchdog=object(),
        _aboutblank_watchdog=object(),
        _security_watchdog=object(),
        _storage_state_watchdog=object(),
        _local_browser_watchdog=object(),
        _default_action_watchdog=object(),
        _dom_watchdog=object(),
        _screenshot_watchdog=object(),
        _permissions_watchdog=object(),
        _recording_watchdog=object(),
        _har_recording_watchdog=object(),
        _watchdogs_attached=True,
    )
    supervisor = module.BrowserWatchdogSupervisor(session)

    supervisor.reset_watchdogs()

    assert session._crash_watchdog is None
    assert session._downloads_watchdog is None
    assert session._dom_watchdog is None
    assert session._har_recording_watchdog is None
    assert session._watchdogs_attached is False

    session._watchdogs_attached = True
    await supervisor.attach_all_watchdogs()
    assert session._watchdogs_attached is True
