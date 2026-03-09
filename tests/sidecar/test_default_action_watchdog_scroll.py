from types import SimpleNamespace

import pytest

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

import browser_use.browser.watchdogs.default_action_watchdog as default_action_watchdog_module
from browser_use.browser.events import ScrollEvent
from browser_use.browser.views import BrowserError
from browser_use.browser.watchdogs.default_action_watchdog import DefaultActionWatchdog


class _FakeLogger:
    def __init__(self):
        self.debug_messages = []
        self.warning_messages = []

    def debug(self, message):
        self.debug_messages.append(message)

    def warning(self, message):
        self.warning_messages.append(message)

    def info(self, _message):
        return None

    def error(self, _message):
        return None


class _FakeBrowserSession:
    def __init__(self, cdp_session, *, viewport_size=(1000, 800)):
        self.agent_focus_target_id = "target-1234"
        self._original_viewport_size = viewport_size
        self._cdp_session = cdp_session
        self.logger = _FakeLogger()

    async def get_or_create_cdp_session(self, *args, **kwargs):
        return self._cdp_session

    async def cdp_client_for_node(self, _element_node):
        return self._cdp_session


def _build_cdp_session(
    *,
    dispatch_mouse_event,
    synthesize_scroll_gesture,
    runtime_evaluate,
    get_layout_metrics,
):
    send = SimpleNamespace(
        Input=SimpleNamespace(
            dispatchMouseEvent=dispatch_mouse_event,
            synthesizeScrollGesture=synthesize_scroll_gesture,
        ),
        Runtime=SimpleNamespace(
            evaluate=runtime_evaluate,
        ),
        Page=SimpleNamespace(
            getLayoutMetrics=get_layout_metrics,
        ),
    )
    return SimpleNamespace(
        cdp_client=SimpleNamespace(send=send),
        session_id="session-1",
    )


@pytest.mark.asyncio
async def test_scroll_event_uses_mouse_wheel_first():
    calls = []

    async def dispatch_mouse_event(*, params, session_id):
        calls.append(("dispatch", params, session_id))
        return {"ok": True}

    async def synthesize_scroll_gesture(*, params, session_id):
        calls.append(("synthesize", params, session_id))
        return {"ok": True}

    async def runtime_evaluate(*, params, session_id):
        calls.append(("evaluate", params, session_id))
        return {"result": {"value": True}}

    async def get_layout_metrics(*, session_id):
        calls.append(("layout", session_id))
        return {"layoutViewport": {"clientWidth": 1000, "clientHeight": 800}}

    cdp_session = _build_cdp_session(
        dispatch_mouse_event=dispatch_mouse_event,
        synthesize_scroll_gesture=synthesize_scroll_gesture,
        runtime_evaluate=runtime_evaluate,
        get_layout_metrics=get_layout_metrics,
    )
    browser_session = _FakeBrowserSession(cdp_session)
    watchdog = DefaultActionWatchdog.model_construct(
        event_bus=SimpleNamespace(),
        browser_session=browser_session,
    )

    await watchdog.on_ScrollEvent(ScrollEvent(direction="down", amount=240, node=None))

    assert calls == [
        (
            "dispatch",
            {
                "type": "mouseWheel",
                "x": 500.0,
                "y": 400.0,
                "deltaX": 0,
                "deltaY": 240,
            },
            "session-1",
        )
    ]


@pytest.mark.asyncio
async def test_scroll_event_falls_back_to_javascript_after_cdp_timeouts(monkeypatch):
    calls = []
    monkeypatch.setattr(default_action_watchdog_module, "_SCROLL_CDP_CALL_TIMEOUT_SECONDS", 0.01)

    async def dispatch_mouse_event(*, params, session_id):
        calls.append(("dispatch", params, session_id))
        await default_action_watchdog_module.asyncio.sleep(0.05)
        return {"ok": True}

    async def synthesize_scroll_gesture(*, params, session_id):
        calls.append(("synthesize", params, session_id))
        await default_action_watchdog_module.asyncio.sleep(0.05)
        return {"ok": True}

    async def runtime_evaluate(*, params, session_id):
        calls.append(("evaluate", params, session_id))
        return {"result": {"value": True}}

    async def get_layout_metrics(*, session_id):
        calls.append(("layout", session_id))
        return {"layoutViewport": {"clientWidth": 1200, "clientHeight": 900}}

    cdp_session = _build_cdp_session(
        dispatch_mouse_event=dispatch_mouse_event,
        synthesize_scroll_gesture=synthesize_scroll_gesture,
        runtime_evaluate=runtime_evaluate,
        get_layout_metrics=get_layout_metrics,
    )
    browser_session = _FakeBrowserSession(cdp_session, viewport_size=None)
    watchdog = DefaultActionWatchdog.model_construct(
        event_bus=SimpleNamespace(),
        browser_session=browser_session,
    )

    await watchdog.on_ScrollEvent(ScrollEvent(direction="down", amount=300, node=None))

    assert calls == [
        ("layout", "session-1"),
        (
            "dispatch",
            {
                "type": "mouseWheel",
                "x": 600.0,
                "y": 450.0,
                "deltaX": 0,
                "deltaY": 300,
            },
            "session-1",
        ),
        (
            "synthesize",
            {
                "x": 600.0,
                "y": 450.0,
                "xDistance": 0,
                "yDistance": -300,
                "speed": 50000,
            },
            "session-1",
        ),
        (
            "evaluate",
            {
                "expression": "window.scrollBy(0, 300)",
                "returnByValue": True,
            },
            "session-1",
        ),
    ]
    assert any("timed out" in message for message in browser_session.logger.warning_messages)


@pytest.mark.asyncio
async def test_scroll_event_raises_browser_error_when_all_fallbacks_fail():
    async def dispatch_mouse_event(*, params, session_id):
        raise RuntimeError("mouse wheel failed")

    async def synthesize_scroll_gesture(*, params, session_id):
        raise RuntimeError("gesture failed")

    async def runtime_evaluate(*, params, session_id):
        raise RuntimeError("js failed")

    async def get_layout_metrics(*, session_id):
        return {"layoutViewport": {"clientWidth": 800, "clientHeight": 600}}

    cdp_session = _build_cdp_session(
        dispatch_mouse_event=dispatch_mouse_event,
        synthesize_scroll_gesture=synthesize_scroll_gesture,
        runtime_evaluate=runtime_evaluate,
        get_layout_metrics=get_layout_metrics,
    )
    browser_session = _FakeBrowserSession(cdp_session)
    watchdog = DefaultActionWatchdog.model_construct(
        event_bus=SimpleNamespace(),
        browser_session=browser_session,
    )

    with pytest.raises(BrowserError, match="Failed to scroll active target"):
        await watchdog.on_ScrollEvent(ScrollEvent(direction="down", amount=180, node=None))
