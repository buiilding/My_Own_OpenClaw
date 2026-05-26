from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_PYTHON = REPO_ROOT / "frontend" / "src" / "main" / "python"


class _Logger:
    def debug(self, *_args, **_kwargs):
        pass


def _class_stub(name: str):
    return type(name, (), {"__init__": lambda self, *args, **kwargs: None})


def _module(name: str, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    return module


def _prepend_frontend_python(monkeypatch):
    monkeypatch.syspath_prepend(str(FRONTEND_PYTHON))


def _install_controller_dependency_stubs(monkeypatch):
    class BrowserSessionRuntime:
        def __init__(self):
            self.playwright = None
            self.browser = None
            self.context = None
            self.page = None
            self.cdp_url = None
            self.mode = None
            self.user_data_dir = None
            self.browser_process = None
            self.headless = True
            self.trace_active = False
            self.is_connected = False
            self.current_url = ""

    class BrowserActionExecutor:
        def __init__(self, controller):
            self.controller = controller

    stubs = {
        "tools": _module("tools"),
        "tools.browser": _module("tools.browser"),
        "playwright": _module("playwright"),
        "playwright.async_api": _module(
            "playwright.async_api",
            Browser=_class_stub("Browser"),
            BrowserContext=_class_stub("BrowserContext"),
            Page=_class_stub("Page"),
            Playwright=_class_stub("Playwright"),
            async_playwright=lambda: None,
        ),
        "tools.browser.chrome_detection": _module(
            "tools.browser.chrome_detection",
            ChromeExecutable=_class_stub("ChromeExecutable"),
            find_all_chrome_executables=lambda: [],
            find_chrome_executable=lambda: None,
        ),
        "tools.browser.chrome_launcher": _module(
            "tools.browser.chrome_launcher",
            DEFAULT_WINDIE_CDP_PORT=9222,
            DEFAULT_WINDIE_CDP_URL="http://127.0.0.1:9222",
            is_cdp_available=lambda *_args, **_kwargs: False,
            ensure_chrome_with_cdp=lambda *_args, **_kwargs: None,
            ChromeLauncherError=RuntimeError,
        ),
        "tools.browser.action_executor": _module(
            "tools.browser.action_executor",
            BrowserActionExecutor=BrowserActionExecutor,
        ),
        "tools.browser.enhanced_cdp_pipeline": _module(
            "tools.browser.enhanced_cdp_pipeline",
            EnhancedCdpDomPipeline=_class_stub("EnhancedCdpDomPipeline"),
        ),
        "tools.browser.observation_store": _module(
            "tools.browser.observation_store",
            BrowserObservationStore=_class_stub("BrowserObservationStore"),
        ),
        "tools.browser.ref_registry": _module(
            "tools.browser.ref_registry",
            RefRegistry=_class_stub("RefRegistry"),
        ),
        "tools.browser.session_runtime": _module(
            "tools.browser.session_runtime",
            BrowserSessionRuntime=BrowserSessionRuntime,
        ),
        "tools.browser.models": _module(
            "tools.browser.models",
            BrowserTab=_class_stub("BrowserTab"),
            PageSnapshot=_class_stub("PageSnapshot"),
        ),
        "tools.browser.role_snapshot": _module(
            "tools.browser.role_snapshot",
            RoleRef=_class_stub("RoleRef"),
            RoleSnapshotOptions=_class_stub("RoleSnapshotOptions"),
            build_role_snapshot_from_aria_snapshot=lambda *_args, **_kwargs: None,
            get_role_snapshot_stats=lambda *_args, **_kwargs: {},
        ),
    }
    stubs["tools"].__path__ = [str(FRONTEND_PYTHON / "tools")]
    stubs["tools.browser"].__path__ = [str(FRONTEND_PYTHON / "tools" / "browser")]
    for name, module in stubs.items():
        monkeypatch.setitem(sys.modules, name, module)


def _event_class(name: str):
    class Event:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    Event.__name__ = name
    return Event


def _load_navigation_runtime(monkeypatch):
    events = _module(
        "browser_use.browser.events",
        AgentFocusChangedEvent=_event_class("AgentFocusChangedEvent"),
        FileDownloadedEvent=_event_class("FileDownloadedEvent"),
        NavigateToUrlEvent=_event_class("NavigateToUrlEvent"),
        NavigationCompleteEvent=_event_class("NavigationCompleteEvent"),
        NavigationStartedEvent=_event_class("NavigationStartedEvent"),
        SwitchTabEvent=_event_class("SwitchTabEvent"),
        TabCreatedEvent=_event_class("TabCreatedEvent"),
        TabClosedEvent=_event_class("TabClosedEvent"),
    )
    stubs = {
        "browser_use": _module("browser_use"),
        "browser_use.browser": _module("browser_use.browser"),
        "browser_use.browser.events": events,
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


def test_browser_controller_installs_action_executor_runtime_owner(monkeypatch):
    _prepend_frontend_python(monkeypatch)
    _install_controller_dependency_stubs(monkeypatch)
    module_name = "tools.browser.controller"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(
        module_name,
        FRONTEND_PYTHON / "tools" / "browser" / "controller.py",
    )
    controller_module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = controller_module
    spec.loader.exec_module(controller_module)
    controller = controller_module.BrowserController()

    assert isinstance(
        controller._action_executor,
        sys.modules["tools.browser.action_executor"].BrowserActionExecutor,
    )
    assert controller._action_executor.controller is controller
    assert isinstance(
        controller._runtime,
        sys.modules["tools.browser.session_runtime"].BrowserSessionRuntime,
    )


@pytest.mark.asyncio
async def test_navigation_runtime_dispatches_focus_tab_closure(monkeypatch):
    navigation_module = _load_navigation_runtime(monkeypatch)

    class EventBus:
        def __init__(self):
            self.dispatched = []

        async def dispatch(self, event):
            self.dispatched.append(event)

    session = types.SimpleNamespace(
        agent_focus_target_id="tab-active",
        event_bus=EventBus(),
        logger=_Logger(),
    )
    runtime = navigation_module.BrowserSessionNavigationRuntime(session)

    await runtime.on_TabClosedEvent(types.SimpleNamespace(target_id="tab-active"))

    assert len(session.event_bus.dispatched) == 1
    event = session.event_bus.dispatched[0]
    assert event.__class__.__name__ == "SwitchTabEvent"
    assert event.target_id is None


def test_watchdog_supervisor_does_not_store_global_browser_state():
    watchdog_source = (
        REPO_ROOT
        / "frontend/src/main/python/tools/browser/browser_use/browser/watchdog_supervisor.py"
    ).read_text(encoding="utf-8", errors="ignore")

    assert "agent_focus_target_id" not in watchdog_source
    assert "session_manager" not in watchdog_source
