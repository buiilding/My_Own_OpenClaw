"""Regression tests for the Browser Use compatibility adapter."""

from __future__ import annotations

from dataclasses import dataclass
from types import ModuleType
from types import SimpleNamespace
from unittest import mock

import pytest

from tools.browser.browser_tool import BrowserUseCompatibilityAdapter
from tools.browser.browser_tool import get_browser_use_adapter
from tools.browser.browser_tool import (
    ControllerBackedRuntimeProvider,
    get_browser_runtime_provider,
)
from tools.browser.browser_tool import (
    get_native_runtime_handlers,
)
from tools.browser.browser_tool import (
    BrowserUseNativeRuntimeProvider,
)


@dataclass
class DummySnapshot:
    text: str
    url: str = ""
    title: str = ""
    ref_count: int = 0


@pytest.fixture
def make_controller():
    def _make_controller(*, connected: bool = True) -> SimpleNamespace:
        controller = SimpleNamespace()
        controller.is_connected = connected
        controller.close = mock.AsyncMock()
        controller.auto_connect_to_chrome = mock.AsyncMock(
            return_value={
                "status": "connected",
                "mode": "user_chrome",
                "url": "https://example.com",
                "title": "Example",
                "auto_launched": False,
            }
        )
        controller.launch_managed_browser = mock.AsyncMock(
            return_value={
                "status": "launched",
                "mode": "managed",
                "url": "about:blank",
                "title": "",
            }
        )
        controller.get_status = mock.AsyncMock(
            return_value={
                "connected": connected,
                "mode": "user_chrome" if connected else None,
                "url": "https://example.com" if connected else "",
                "title": "Example" if connected else "",
                "tab_count": 1 if connected else 0,
                "target_id": "tab-1" if connected else None,
            }
        )
        controller.navigate = mock.AsyncMock(
            return_value={
                "success": True,
                "url": "https://example.com",
                "title": "Example",
                "status": 200,
            }
        )
        controller.open_tab = mock.AsyncMock(
            return_value={
                "success": True,
                "target_id": "tab-2",
                "url": "https://example.com/new",
                "title": "New Tab",
                "status": 200,
            }
        )
        controller.get_tabs = mock.AsyncMock(
            return_value=[
                SimpleNamespace(
                    target_id="tab-1",
                    title="Example",
                    url="https://example.com",
                )
            ]
        )
        controller.wait_for_load = mock.AsyncMock(return_value={"success": True})
        controller.type_text = mock.AsyncMock(return_value={"success": True})
        controller.press_key = mock.AsyncMock(return_value={"success": True})
        controller.scroll = mock.AsyncMock(return_value={"success": True})
        controller.screenshot = mock.AsyncMock(return_value=b"controller-image")
        controller.set_input_files = mock.AsyncMock(return_value={"success": True})
        controller.get_page_snapshot = mock.AsyncMock(
            return_value=DummySnapshot(text="snapshot", url="https://example.com", title="Example")
        )
        controller.evaluate = mock.AsyncMock(
            return_value={
                "success": True,
                "result": {
                    "title": "Example",
                    "url": "https://example.com",
                    "content": "Page Text:\nExample",
                    "structured": {"tables": [], "lists": []},
                },
            }
        )
        controller.switch_tab = mock.AsyncMock(return_value=True)
        controller.click = mock.AsyncMock(return_value={"success": True, "ref": "e1"})
        controller.trace_start = mock.AsyncMock(return_value={"success": True})
        controller.trace_stop = mock.AsyncMock(
            return_value={"success": True, "trace_bytes": b"zip"}
        )
        return controller

    return _make_controller


class TestBrowserUseCompatibilityAdapter:
    @staticmethod
    def _make_adapter(controller: SimpleNamespace) -> BrowserUseCompatibilityAdapter:
        async def _execute_browser_use_action(
            *,
            action: str,
            params: dict[str, object],
        ) -> dict[str, object]:
            return {
                "success": True,
                "action": action,
                "native_source": "browser_use.tools",
                "params": dict(params),
            }

        runtime = ControllerBackedRuntimeProvider(controller)
        runtime.execute_browser_use_action = mock.AsyncMock(
            side_effect=_execute_browser_use_action
        )
        return BrowserUseCompatibilityAdapter(
            controller,
            runtime_provider=runtime,
        )

    @pytest.mark.asyncio
    async def test_execute_unknown_action_returns_unsupported(self, make_controller):
        adapter = self._make_adapter(make_controller())

        result = await adapter.execute("unknown_action", {})

        assert result.success is False
        assert result.action == "unknown_action"
        assert result.error_code == "ACTION_UNSUPPORTED"

    @pytest.mark.asyncio
    async def test_trace_actions_are_not_supported(self, make_controller):
        controller = make_controller()
        adapter = self._make_adapter(controller)

        start_result = await adapter.execute("trace_start", {"action": "trace_start"})
        stop_result = await adapter.execute("trace_stop", {"action": "trace_stop"})

        assert start_result.success is False
        assert start_result.error_code == "ACTION_UNSUPPORTED"
        assert "Unhandled action" in (start_result.error or "")
        assert stop_result.success is False
        assert stop_result.error_code == "ACTION_UNSUPPORTED"
        controller.trace_start.assert_not_awaited()
        controller.trace_stop.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_snapshot_requires_connection(self, make_controller):
        adapter = self._make_adapter(make_controller(connected=False))

        result = await adapter.execute("snapshot", {"action": "snapshot"})

        assert result.success is False
        assert result.action == "snapshot"
        assert result.error_code == "BROWSER_NOT_CONNECTED"

    @pytest.mark.asyncio
    async def test_snapshot_rejects_compatibility_fields(self, make_controller):
        adapter = self._make_adapter(make_controller())

        result = await adapter.execute(
            "snapshot",
            {"action": "snapshot", "format": "ai"},
        )

        assert result.success is False
        assert result.action == "snapshot"
        assert result.error_code == "INVALID_ARGUMENT"
        assert "no longer supports compatibility 'format'" in (result.error or "")

    @pytest.mark.asyncio
    async def test_snapshot_routes_to_browser_use_runtime(self, make_controller):
        controller = make_controller()
        runtime = ControllerBackedRuntimeProvider(controller)
        runtime.execute_browser_use_action = mock.AsyncMock(
            return_value={
                "success": True,
                "action": "snapshot",
                "native_source": "browser_use.state",
                "format": "browser_use_state",
                "url": "https://example.com/page",
                "title": "Example",
                "snapshot": "x" * 300,
                "ref_count": 3,
                "offset": 4500,
                "limit": 300,
                "returned_chars": 300,
                "total_chars": 6000,
                "has_more": True,
                "next_offset": 4800,
            }
        )
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "snapshot",
            {
                "action": "snapshot",
                "offset": 4500,
                "limit": 300,
            },
        )

        assert result.success is True
        assert result.action == "snapshot"
        assert result.data["browser_use_action"] == "snapshot"
        assert result.data["returned_chars"] == 300
        assert result.data["total_chars"] == 6000
        assert result.data["has_more"] is True
        assert result.data["next_offset"] == 4800
        runtime.execute_browser_use_action.assert_awaited_once_with(
            action="snapshot",
            params={"offset": 4500, "limit": 300, "include_screenshot": False},
        )
        controller.get_page_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_snapshot_rejects_window_above_cap(self, make_controller):
        controller = make_controller()
        runtime = ControllerBackedRuntimeProvider(controller)
        runtime.execute_browser_use_action = mock.AsyncMock()
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "snapshot",
            {
                "action": "snapshot",
                "offset": 119_500,
                "limit": 1_000,
            },
        )

        assert result.success is False
        assert result.error_code == "INVALID_ARGUMENT"
        assert "offset + limit exceeds maximum snapshot window" in (result.error or "")
        runtime.execute_browser_use_action.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_extract_rejects_compatibility_mode(self, make_controller):
        adapter = self._make_adapter(make_controller())

        result = await adapter.execute(
            "extract",
            {
                "action": "extract",
                "query": "engineer",
                "mode": "structured",
            },
        )

        assert result.success is False
        assert result.action == "extract"
        assert result.error_code == "INVALID_ARGUMENT"
        assert "no longer supports compatibility 'mode'" in (result.error or "")

    @pytest.mark.asyncio
    async def test_extract_rejects_invalid_mode(self, make_controller):
        adapter = self._make_adapter(make_controller())

        result = await adapter.execute(
            "extract",
            {
                "action": "extract",
                "query": "test",
                "mode": "unsupported",
            },
        )

        assert result.success is False
        assert result.action == "extract"
        assert result.error_code == "INVALID_ARGUMENT"
        assert "no longer supports compatibility 'mode'" in (result.error or "")

    @pytest.mark.asyncio
    async def test_act_click_with_role_ref_is_rejected(self, make_controller):
        controller = make_controller()
        adapter = self._make_adapter(controller)

        result = await adapter.execute(
            "act",
            {
                "action": "act",
                "request": {
                    "kind": "click",
                    "ref": "e1",
                },
            },
        )

        assert result.success is False
        assert result.action == "click"
        assert result.error_code == "INVALID_ARGUMENT"
        assert "click requires integer 'index'" in (result.error or "")
        controller.click.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_act_click_with_index_routes_to_browser_use_action(
        self,
        make_controller,
    ):
        controller = make_controller()
        runtime = SimpleNamespace(
            is_connected=True,
            execute_browser_use_action=mock.AsyncMock(
                return_value={
                    "success": True,
                    "action": "click",
                    "native_source": "browser_use.tools",
                }
            ),
        )
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "act",
            {
                "action": "act",
                "request": {
                    "kind": "click",
                    "index": 3,
                },
            },
        )

        assert result.success is True
        assert result.action == "click"
        runtime.execute_browser_use_action.assert_awaited_once_with(
            action="click",
            params={"index": 3},
        )

    @pytest.mark.asyncio
    async def test_click_with_coordinates_routes_to_browser_use_action(
        self,
        make_controller,
    ):
        controller = make_controller()
        runtime = SimpleNamespace(
            is_connected=True,
            execute_browser_use_action=mock.AsyncMock(
                return_value={
                    "success": True,
                    "action": "click",
                    "native_source": "browser_use.tools",
                }
            ),
        )
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "click",
            {
                "action": "click",
                "coordinate_x": 120,
                "coordinate_y": 220,
            },
        )

        assert result.success is True
        assert result.action == "click"
        runtime.execute_browser_use_action.assert_awaited_once_with(
            action="click",
            params={"coordinate_x": 120, "coordinate_y": 220},
        )

    @pytest.mark.asyncio
    async def test_direct_browser_use_action_routes_to_runtime_executor(
        self,
        make_controller,
    ):
        controller = make_controller()
        runtime = SimpleNamespace(
            is_connected=True,
            execute_browser_use_action=mock.AsyncMock(
                return_value={
                    "success": True,
                    "action": "search",
                    "native_source": "browser_use.tools",
                    "extracted_content": "Found results",
                }
            ),
        )
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "search",
            {"action": "search", "query": "windie browser use"},
        )

        assert result.success is True
        assert result.action == "search"
        assert result.data["browser_use_action"] == "search"
        runtime.execute_browser_use_action.assert_awaited_once_with(
            action="search",
            params={"query": "windie browser use"},
        )

    @pytest.mark.asyncio
    async def test_browser_use_action_requires_connection_when_needed(
        self,
        make_controller,
    ):
        controller = make_controller(connected=False)
        runtime = SimpleNamespace(
            is_connected=False,
            execute_browser_use_action=mock.AsyncMock(),
        )
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "find_text",
            {"action": "find_text", "text": "pricing"},
        )

        assert result.success is False
        assert result.action == "find_text"
        assert result.error_code == "BROWSER_NOT_CONNECTED"
        runtime.execute_browser_use_action.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_act_switch_kind_routes_to_browser_use_action(
        self,
        make_controller,
    ):
        controller = make_controller()
        runtime = SimpleNamespace(
            is_connected=True,
            execute_browser_use_action=mock.AsyncMock(
                return_value={
                    "success": True,
                    "action": "switch",
                    "native_source": "browser_use.tools",
                }
            ),
        )
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "act",
            {
                "action": "act",
                "request": {
                    "kind": "switch",
                    "tab_id": "abcd1234",
                },
            },
        )

        assert result.success is True
        assert result.action == "switch"
        runtime.execute_browser_use_action.assert_awaited_once_with(
            action="switch",
            params={"tab_id": "1234"},
        )

    @pytest.mark.asyncio
    async def test_extract_with_output_schema_routes_to_browser_use_action(
        self,
        make_controller,
    ):
        controller = make_controller()
        output_schema = {
            "type": "object",
            "properties": {"price": {"type": "string"}},
        }
        runtime = SimpleNamespace(
            is_connected=True,
            execute_browser_use_action=mock.AsyncMock(
                return_value={
                    "success": True,
                    "action": "extract",
                    "native_source": "browser_use.tools",
                    "extracted_content": '{"price":"$10"}',
                }
            ),
        )
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "extract",
            {
                "action": "extract",
                "query": "price",
                "output_schema": output_schema,
            },
        )

        assert result.success is True
        assert result.action == "extract"
        runtime.execute_browser_use_action.assert_awaited_once_with(
            action="extract",
            params={
                "query": "price",
                "output_schema": output_schema,
            },
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("kind", "request_payload", "expected_params"),
        [
            (
                "navigate",
                {"url": "https://example.com/path"},
                {"url": "https://example.com/path"},
            ),
            (
                "extract",
                {"query": "pricing"},
                {"query": "pricing"},
            ),
            (
                "scroll",
                {"pages": 0.5, "down": False},
                {"pages": 0.5, "down": False},
            ),
            (
                "screenshot",
                {"file_name": "capture.png"},
                {"file_name": "capture.png"},
            ),
            (
                "wait",
                {"seconds": 1},
                {"seconds": 1},
            ),
        ],
    )
    async def test_act_forwards_browser_use_action_kinds(
        self,
        make_controller,
        kind,
        request_payload,
        expected_params,
    ):
        controller = make_controller()
        runtime = SimpleNamespace(
            is_connected=True,
            execute_browser_use_action=mock.AsyncMock(
                return_value={
                    "success": True,
                    "action": kind,
                    "native_source": "browser_use.tools",
                }
            ),
        )
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "act",
            {
                "action": "act",
                "request": {
                    "kind": kind,
                    **request_payload,
                },
            },
        )

        assert result.success is True
        assert result.action == kind
        runtime.execute_browser_use_action.assert_awaited_once_with(
            action=kind,
            params=expected_params,
        )

    @pytest.mark.asyncio
    async def test_act_evaluate_routes_code_to_browser_use(
        self,
        make_controller,
    ):
        controller = make_controller()
        runtime = SimpleNamespace(
            is_connected=True,
            execute_browser_use_action=mock.AsyncMock(
                return_value={
                    "success": True,
                    "action": "evaluate",
                    "native_source": "browser_use.tools",
                }
            ),
        )
        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        result = await adapter.execute(
            "act",
            {
                "action": "act",
                "request": {
                    "kind": "evaluate",
                    "code": "1 + 1",
                },
            },
        )

        assert result.success is True
        assert result.action == "evaluate"
        runtime.execute_browser_use_action.assert_awaited_once_with(
            action="evaluate",
            params={"code": "1 + 1"},
        )

    @pytest.mark.asyncio
    async def test_runtime_provider_injection_for_core_actions(self, make_controller):
        controller = make_controller()
        controller.navigate = mock.AsyncMock(
            side_effect=AssertionError("controller.navigate should not be called directly")
        )
        controller.open_tab = mock.AsyncMock(
            side_effect=AssertionError("controller.open_tab should not be called directly")
        )
        controller.get_tabs = mock.AsyncMock(
            side_effect=AssertionError("controller.get_tabs should not be called directly")
        )
        controller.switch_tab = mock.AsyncMock(
            side_effect=AssertionError("controller.switch_tab should not be called directly")
        )
        controller.get_status = mock.AsyncMock(
            side_effect=AssertionError("controller.get_status should not be called directly")
        )
        controller.close = mock.AsyncMock(
            side_effect=AssertionError("controller.close should not be called directly")
        )
        controller.click = mock.AsyncMock(
            side_effect=AssertionError("controller.click should not be called directly")
        )
        controller.wait_for_load = mock.AsyncMock(
            side_effect=AssertionError("controller.wait_for_load should not be called directly")
        )
        controller.evaluate = mock.AsyncMock(
            side_effect=AssertionError("controller.evaluate should not be called directly")
        )
        controller.set_input_files = mock.AsyncMock(
            side_effect=AssertionError("controller.set_input_files should not be called directly")
        )
        controller.get_page_snapshot = mock.AsyncMock(
            side_effect=AssertionError("controller.get_page_snapshot should not be called directly")
        )

        runtime = SimpleNamespace()
        runtime.is_connected = True
        runtime.close = mock.AsyncMock()
        runtime.connect_user_chrome = mock.AsyncMock()
        runtime.connect_managed = mock.AsyncMock()
        runtime.get_status = mock.AsyncMock(
            return_value={
                "connected": True,
                "mode": "user_chrome",
                "url": "https://runtime.example/status",
                "title": "Runtime Status",
                "tab_count": 2,
                "target_id": "tab-2",
            }
        )
        runtime.navigate = mock.AsyncMock(
            return_value={
                "success": True,
                "url": "https://runtime.example/nav",
                "title": "Runtime Navigate",
                "status": 200,
            }
        )
        runtime.open_tab = mock.AsyncMock(
            return_value={
                "success": True,
                "target_id": "tab-2",
                "url": "https://runtime.example/new",
                "title": "Runtime New Tab",
                "status": 200,
            }
        )
        runtime.get_tabs = mock.AsyncMock(
            return_value=[
                {"target_id": "tab-1", "title": "One", "url": "https://runtime.example/one"},
                SimpleNamespace(target_id="tab-2", title="Two", url="https://runtime.example/two"),
            ]
        )
        runtime.switch_tab = mock.AsyncMock(return_value=True)
        runtime.click = mock.AsyncMock(return_value={"success": True})
        runtime.type_text = mock.AsyncMock(return_value={"success": True})
        runtime.press_key = mock.AsyncMock(return_value={"success": True})
        runtime.scroll = mock.AsyncMock(return_value={"success": True})
        runtime.wait_for_load = mock.AsyncMock(return_value={"success": True})
        runtime.wait_seconds = mock.AsyncMock(return_value={"success": True})
        runtime.evaluate = mock.AsyncMock(return_value={"success": True, "result": {"ok": True}})
        runtime.screenshot = mock.AsyncMock(return_value=b"img")
        runtime.get_page_snapshot = mock.AsyncMock(
            return_value=DummySnapshot(
                text="runtime snapshot",
                url="https://runtime.example/snapshot",
                title="Runtime Snapshot",
                ref_count=1,
            )
        )
        runtime.set_input_files = mock.AsyncMock(return_value={"success": True, "uploaded_count": 1})
        async def _execute_browser_use_action(*, action, params):
            if action == "status":
                return {
                    "success": True,
                    "action": "status",
                    "native_source": "browser_use.state",
                    "connected": True,
                    "mode": "user_chrome",
                    "url": "https://runtime.example/status",
                    "title": "Runtime Status",
                    "tab_count": 2,
                    "target_id": "tab-2",
                }
            if action == "get_tabs":
                return {
                    "success": True,
                    "action": "get_tabs",
                    "native_source": "browser_use.state",
                    "tab_count": 2,
                    "tabs": [
                        {"target_id": "tab-1", "title": "One", "url": "https://runtime.example/one"},
                        {"target_id": "tab-2", "title": "Two", "url": "https://runtime.example/two"},
                    ],
                }
            if action == "switch":
                return {
                    "success": True,
                    "action": "switch",
                    "native_source": "browser_use.tools",
                    "extracted_content": "Switched",
                }
            if action == "upload_file":
                return {
                    "success": True,
                    "action": "upload_file",
                    "native_source": "browser_use.tools",
                    "extracted_content": "Uploaded file",
                }
            if action == "navigate":
                return {
                    "success": True,
                    "action": "navigate",
                    "native_source": "browser_use.tools",
                    "url": params.get("url", ""),
                    "title": "Runtime Navigate",
                    "status": 200,
                }
            return {
                "success": True,
                "action": action,
                "native_source": "browser_use.tools",
                "result": {"ok": True},
                "params": dict(params),
            }

        runtime.execute_browser_use_action = mock.AsyncMock(
            side_effect=_execute_browser_use_action
        )

        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        status_result = await adapter.execute("status", {"action": "status"})
        assert status_result.success is True
        assert status_result.data["url"] == "https://runtime.example/status"
        runtime.execute_browser_use_action.assert_awaited_with(
            action="status",
            params={},
        )
        runtime.get_status.assert_not_awaited()

        navigate_result = await adapter.execute(
            "navigate",
            {
                "action": "navigate",
                "target_id": "tab-2",
                "url": "https://runtime.example/nav",
            },
        )
        assert navigate_result.success is True
        assert navigate_result.data["browser_use_action"] == "navigate"
        runtime.execute_browser_use_action.assert_awaited_with(
            action="navigate",
            params={"url": "https://runtime.example/nav"},
        )
        runtime.navigate.assert_not_awaited()

        open_result = await adapter.execute(
            "open",
            {"action": "open", "url": "https://runtime.example/new"},
        )
        assert open_result.success is True
        assert open_result.data["browser_use_action"] == "navigate"
        assert open_result.data["new_tab"] is True
        runtime.execute_browser_use_action.assert_awaited_with(
            action="navigate",
            params={"url": "https://runtime.example/new", "new_tab": True},
        )
        runtime.open_tab.assert_not_awaited()

        tabs_result = await adapter.execute("get_tabs", {"action": "get_tabs"})
        assert tabs_result.success is True
        assert tabs_result.data["tab_count"] == 2
        assert tabs_result.data["tabs"][0]["target_id"] == "tab-1"
        assert tabs_result.data["tabs"][1]["target_id"] == "tab-2"
        runtime.execute_browser_use_action.assert_awaited_with(
            action="get_tabs",
            params={},
        )
        runtime.get_tabs.assert_not_awaited()

        switch_result = await adapter.execute(
            "switch_tab",
            {"action": "switch_tab", "target_id": "abcd"},
        )
        assert switch_result.success is True
        assert switch_result.data["target_id"] == "abcd"
        assert switch_result.data["browser_use_action"] == "switch"
        runtime.execute_browser_use_action.assert_awaited_with(
            action="switch",
            params={"tab_id": "abcd"},
        )
        runtime.switch_tab.assert_not_awaited()

        close_result = await adapter.execute("close", {"action": "close"})
        assert close_result.success is True
        runtime.close.assert_awaited_once()

        click_result = await adapter.execute("click", {"action": "click", "index": 1})
        assert click_result.success is True
        runtime.execute_browser_use_action.assert_awaited_with(
            action="click",
            params={"index": 1},
        )
        runtime.click.assert_not_awaited()

        type_result = await adapter.execute(
            "type",
            {"action": "type", "ref": "3", "text": "Hello"},
        )
        assert type_result.success is True
        assert type_result.data["browser_use_action"] == "input"
        runtime.execute_browser_use_action.assert_awaited_with(
            action="input",
            params={"index": 3, "text": "Hello"},
        )
        runtime.type_text.assert_not_awaited()

        press_result = await adapter.execute(
            "press",
            {"action": "press", "key": "Enter"},
        )
        assert press_result.success is True
        assert press_result.data["browser_use_action"] == "send_keys"
        runtime.execute_browser_use_action.assert_awaited_with(
            action="send_keys",
            params={"keys": "Enter"},
        )
        runtime.press_key.assert_not_awaited()

        wait_result = await adapter.execute("wait", {"action": "wait", "state": "load"})
        assert wait_result.success is False
        assert wait_result.error_code == "INVALID_ARGUMENT"
        runtime.wait_for_load.assert_not_awaited()

        timed_wait_result = await adapter.execute(
            "wait",
            {"action": "wait", "seconds": 2.5},
        )
        assert timed_wait_result.success is True
        runtime.execute_browser_use_action.assert_awaited_with(
            action="wait",
            params={"seconds": 2},
        )
        runtime.wait_seconds.assert_not_awaited()

        evaluate_result = await adapter.execute(
            "evaluate",
            {"action": "evaluate", "script": "1 + 1"},
        )
        assert evaluate_result.success is True
        runtime.execute_browser_use_action.assert_awaited_with(
            action="evaluate",
            params={"code": "1 + 1"},
        )
        runtime.evaluate.assert_not_awaited()

        upload_result = await adapter.execute(
            "upload_file",
            {"action": "upload_file", "ref": "1", "paths": ["/tmp/file.txt"]},
        )
        assert upload_result.success is True
        assert upload_result.data["browser_use_action"] == "upload_file"
        runtime.execute_browser_use_action.assert_awaited_with(
            action="upload_file",
            params={"index": 1, "path": "/tmp/file.txt"},
        )
        runtime.set_input_files.assert_not_awaited()

        snapshot_result = await adapter.execute(
            "snapshot",
            {"action": "snapshot", "offset": 100, "limit": 250},
        )
        assert snapshot_result.success is True
        assert snapshot_result.data["browser_use_action"] == "snapshot"
        runtime.execute_browser_use_action.assert_awaited_with(
            action="snapshot",
            params={"offset": 100, "limit": 250, "include_screenshot": False},
        )
        runtime.get_page_snapshot.assert_not_awaited()

    def test_runtime_factory_raises_when_native_provider_unavailable(
        self,
        make_controller,
    ):
        controller = make_controller()
        fake_runtime_module = ModuleType("tools.browser.browser_tool")
        fake_runtime_module.create_browser_use_native_runtime_provider = mock.Mock(
            return_value=None
        )
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_USE_RUNTIME": "browser_use_native"},
            clear=False,
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser.browser_tool.import_module",
            return_value=fake_runtime_module,
        ):
            with pytest.raises(RuntimeError, match="provider is unavailable"):
                get_browser_runtime_provider(controller)

    def test_runtime_factory_raises_when_browser_use_unavailable(
        self,
        make_controller,
    ):
        controller = make_controller()
        with mock.patch.dict("os.environ", {}, clear=True), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=None,
        ):
            with pytest.raises(RuntimeError, match="unavailable"):
                get_browser_runtime_provider(controller)

    def test_runtime_factory_defaults_to_native_when_browser_use_available(
        self,
        make_controller,
    ):
        controller = make_controller()
        with mock.patch.dict("os.environ", {}, clear=True), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ):
            runtime = get_browser_runtime_provider(controller)

        assert runtime.__class__.__name__ == "BrowserUseNativeRuntimeProvider"

    def test_runtime_factory_alias_browser_use_is_supported(
        self,
        make_controller,
    ):
        controller = make_controller()
        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_USE_RUNTIME": "browser_use",
            },
            clear=False,
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ):
            runtime = get_browser_runtime_provider(controller)

        assert runtime.__class__.__name__ == "BrowserUseNativeRuntimeProvider"

    def test_runtime_factory_unknown_runtime_raises(self, make_controller):
        controller = make_controller()
        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_USE_RUNTIME": "unknown_runtime",
            },
            clear=False,
        ):
            with pytest.raises(RuntimeError, match="Unknown browser runtime"):
                get_browser_runtime_provider(controller)

    def test_runtime_factory_import_failure_raises(
        self,
        make_controller,
    ):
        controller = make_controller()
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_USE_RUNTIME": "browser_use_native"},
            clear=False,
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=ImportError("simulated import failure"),
        ):
            with pytest.raises(RuntimeError, match="native provider load failed"):
                get_browser_runtime_provider(controller)

    def test_runtime_factory_selects_native_provider_when_browser_use_available(
        self,
        make_controller,
    ):
        controller = make_controller()
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_USE_RUNTIME": "browser_use_native"},
            clear=False,
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ):
            runtime = get_browser_runtime_provider(controller)

        assert runtime.__class__.__name__ == "BrowserUseNativeRuntimeProvider"
        assert "wait_seconds" in runtime._native_handlers
        assert "search" in runtime._native_handlers

    @pytest.mark.asyncio
    async def test_native_provider_executes_browser_use_action_handler(
        self,
        make_controller,
    ):
        controller = make_controller()
        native_navigate = mock.AsyncMock(
            return_value={
                "success": True,
                "action": "navigate",
                "native_source": "browser_use.tools",
                "url": "https://native.example/nav",
            }
        )
        provider = BrowserUseNativeRuntimeProvider(
            controller,
            native_handlers={"navigate": native_navigate},
        )

        result = await provider.execute_browser_use_action(
            action="navigate",
            params={"url": "https://native.example/nav"},
        )

        assert result["success"] is True
        assert result["native_source"] == "browser_use.tools"
        native_navigate.assert_awaited_once_with(url="https://native.example/nav")
        controller.navigate.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_native_provider_raises_without_handler(
        self,
        make_controller,
    ):
        controller = make_controller()
        provider = BrowserUseNativeRuntimeProvider(controller, native_handlers={})

        with pytest.raises(RuntimeError, match="No Browser Use native handler"):
            await provider.execute_browser_use_action(
                action="navigate",
                params={"url": "https://example.com"},
            )

    @pytest.mark.asyncio
    async def test_native_provider_non_browser_use_methods_use_controller(
        self,
        make_controller,
    ):
        controller = make_controller()
        provider = BrowserUseNativeRuntimeProvider(controller, native_handlers={})

        result = await provider.navigate(url="https://example.com", wait_until="load")

        assert result["status"] == 200
        controller.navigate.assert_awaited_once_with("https://example.com", "load")

    def test_get_browser_use_adapter_caches_for_weakrefable_controller(self):
        class _Controller:
            is_connected = False

        controller = _Controller()
        fake_runtime = mock.Mock()

        with mock.patch(
            "tools.browser.browser_tool.get_browser_runtime_provider",
            return_value=fake_runtime,
        ) as runtime_factory:
            adapter_one = get_browser_use_adapter(controller)
            adapter_two = get_browser_use_adapter(controller)

        assert adapter_one is adapter_two
        assert adapter_one._runtime is fake_runtime
        runtime_factory.assert_called_once_with(controller)

    @pytest.mark.asyncio
    async def test_default_native_handler_registry_includes_browser_use_wait_seconds(
        self,
    ):
        fake_service_module = ModuleType("browser_use.tools.service")
        fake_browser_module = ModuleType("browser_use.browser")
        fake_filesystem_module = ModuleType("browser_use.filesystem.file_system")
        execute_action = mock.AsyncMock(
            return_value=SimpleNamespace(extracted_content="Waited for 2 seconds")
        )

        class FakeTools:
            def __init__(self):
                self.registry = SimpleNamespace(execute_action=execute_action)

        class FakeBrowserSession:
            def __init__(self, **_kwargs):
                pass

            async def start(self):
                return None

            async def stop(self):
                return None

        class FakeFileSystem:
            def __init__(self, *_args, **_kwargs):
                pass

        fake_service_module.Tools = FakeTools
        fake_browser_module.BrowserSession = FakeBrowserSession
        fake_filesystem_module.FileSystem = FakeFileSystem

        def _import_module(name: str):
            if name == "browser_use.tools.service":
                return fake_service_module
            if name == "browser_use.browser":
                return fake_browser_module
            if name == "browser_use.filesystem.file_system":
                return fake_filesystem_module
            raise ImportError(name)

        with mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=_import_module,
        ):
            handlers = get_native_runtime_handlers()
            assert "wait_seconds" in handlers
            result = await handlers["wait_seconds"](seconds=2.2)
            assert result["success"] is True
            assert result["native_source"] == "windie.timer"
            assert result["seconds"] == 2.2
            execute_action.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_wait_seconds_uses_browser_use_when_connected(self):
        fake_service_module = ModuleType("browser_use.tools.service")
        fake_browser_module = ModuleType("browser_use.browser")
        fake_filesystem_module = ModuleType("browser_use.filesystem.file_system")
        execute_action = mock.AsyncMock(
            return_value=SimpleNamespace(extracted_content="Waited")
        )

        class FakeTools:
            def __init__(self):
                self.registry = SimpleNamespace(execute_action=execute_action)

            def set_coordinate_clicking(self, _enabled: bool):
                pass

        class FakeBrowserSession:
            def __init__(self, **_kwargs):
                pass

            async def start(self):
                return None

            async def stop(self):
                return None

        class FakeFileSystem:
            def __init__(self, *_args, **_kwargs):
                pass

        fake_service_module.Tools = FakeTools
        fake_browser_module.BrowserSession = FakeBrowserSession
        fake_filesystem_module.FileSystem = FakeFileSystem

        def _import_module(name: str):
            if name == "browser_use.tools.service":
                return fake_service_module
            if name == "browser_use.browser":
                return fake_browser_module
            if name == "browser_use.filesystem.file_system":
                return fake_filesystem_module
            raise ImportError(name)

        controller = SimpleNamespace(is_connected=True, _mode="managed", _cdp_url=None)

        with mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=_import_module,
        ):
            handlers = get_native_runtime_handlers(controller=controller)
            result = await handlers["wait_seconds"](seconds=2.2)

        assert result["success"] is True
        assert result["native_source"] == "browser_use.tools"
        assert result["seconds"] == 2.2
        execute_action.assert_awaited_once_with(
            "wait",
            {"seconds": 2},
            browser_session=mock.ANY,
            file_system=None,
            available_file_paths=[],
            page_extraction_llm=None,
        )

    @pytest.mark.asyncio
    async def test_native_handler_registry_enables_coordinate_clicking_and_upload_paths(
        self,
    ):
        fake_service_module = ModuleType("browser_use.tools.service")
        fake_browser_module = ModuleType("browser_use.browser")
        fake_filesystem_module = ModuleType("browser_use.filesystem.file_system")
        execute_action = mock.AsyncMock(
            return_value=SimpleNamespace(extracted_content="Uploaded file")
        )

        class FakeTools:
            last_instance = None

            def __init__(self):
                self.registry = SimpleNamespace(execute_action=execute_action)
                self.coordinate_clicking_enabled = False
                FakeTools.last_instance = self

            def set_coordinate_clicking(self, enabled: bool):
                self.coordinate_clicking_enabled = enabled

        class FakeBrowserSession:
            def __init__(self, **_kwargs):
                pass

            async def start(self):
                return None

            async def stop(self):
                return None

        class FakeFileSystem:
            def __init__(self, *_args, **_kwargs):
                pass

        fake_service_module.Tools = FakeTools
        fake_browser_module.BrowserSession = FakeBrowserSession
        fake_filesystem_module.FileSystem = FakeFileSystem

        def _import_module(name: str):
            if name == "browser_use.tools.service":
                return fake_service_module
            if name == "browser_use.browser":
                return fake_browser_module
            if name == "browser_use.filesystem.file_system":
                return fake_filesystem_module
            raise ImportError(name)

        controller = SimpleNamespace(is_connected=True, _mode="managed", _cdp_url=None)

        with mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=_import_module,
        ):
            handlers = get_native_runtime_handlers(controller=controller)
            result = await handlers["upload_file"](index=3, path="/tmp/upload.txt")

        assert result["success"] is True
        assert result["native_source"] == "browser_use.tools"
        assert FakeTools.last_instance is not None
        assert FakeTools.last_instance.coordinate_clicking_enabled is True
        execute_action.assert_awaited_once_with(
            "upload_file",
            {"index": 3, "path": "/tmp/upload.txt"},
            browser_session=mock.ANY,
            file_system=None,
            available_file_paths=["/tmp/upload.txt"],
            page_extraction_llm=None,
        )

    @pytest.mark.asyncio
    async def test_native_handler_extract_uses_configured_browser_use_llm_and_filesystem(
        self,
    ):
        fake_service_module = ModuleType("browser_use.tools.service")
        fake_browser_module = ModuleType("browser_use.browser")
        fake_filesystem_module = ModuleType("browser_use.filesystem.file_system")
        fake_llm_models_module = ModuleType("browser_use.llm.models")
        execute_action = mock.AsyncMock(
            return_value=SimpleNamespace(extracted_content="Extracted content")
        )
        fake_page_extraction_llm = object()
        get_llm_by_name = mock.Mock(return_value=fake_page_extraction_llm)

        class FakeTools:
            def __init__(self):
                self.registry = SimpleNamespace(execute_action=execute_action)

        class FakeBrowserSession:
            def __init__(self, **_kwargs):
                pass

            async def start(self):
                return None

            async def stop(self):
                return None

        class FakeFileSystem:
            def __init__(self, *_args, **_kwargs):
                pass

        fake_service_module.Tools = FakeTools
        fake_browser_module.BrowserSession = FakeBrowserSession
        fake_filesystem_module.FileSystem = FakeFileSystem
        fake_llm_models_module.get_llm_by_name = get_llm_by_name

        def _import_module(name: str):
            if name == "browser_use.tools.service":
                return fake_service_module
            if name == "browser_use.browser":
                return fake_browser_module
            if name == "browser_use.filesystem.file_system":
                return fake_filesystem_module
            if name == "browser_use.llm.models":
                return fake_llm_models_module
            raise ImportError(name)

        controller = SimpleNamespace(is_connected=True, _mode="managed", _cdp_url=None)

        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_USE_EXTRACTION_MODEL": "openai_gpt_4o_mini"},
            clear=False,
        ), mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=_import_module,
        ):
            handlers = get_native_runtime_handlers(controller=controller)
            result = await handlers["extract"](query="pricing")

        assert result["success"] is True
        assert result["native_source"] == "browser_use.tools"
        get_llm_by_name.assert_called_once_with("openai_gpt_4o_mini")
        execute_action.assert_awaited_once_with(
            "extract",
            {"query": "pricing"},
            browser_session=mock.ANY,
            file_system=mock.ANY,
            available_file_paths=[],
            page_extraction_llm=fake_page_extraction_llm,
        )

    @pytest.mark.asyncio
    async def test_native_handler_extract_uses_windie_provider_model_settings(
        self,
    ):
        fake_service_module = ModuleType("browser_use.tools.service")
        fake_browser_module = ModuleType("browser_use.browser")
        fake_filesystem_module = ModuleType("browser_use.filesystem.file_system")
        fake_openai_chat_module = ModuleType("browser_use.llm.openai.chat")
        execute_action = mock.AsyncMock(
            return_value=SimpleNamespace(extracted_content="Extracted content")
        )

        class FakeTools:
            def __init__(self):
                self.registry = SimpleNamespace(execute_action=execute_action)

        class FakeBrowserSession:
            def __init__(self, **_kwargs):
                pass

            async def start(self):
                return None

            async def stop(self):
                return None

        class FakeFileSystem:
            def __init__(self, *_args, **_kwargs):
                pass

        class FakeChatOpenAI:
            def __init__(self, **kwargs):
                self.kwargs = kwargs

        fake_service_module.Tools = FakeTools
        fake_browser_module.BrowserSession = FakeBrowserSession
        fake_filesystem_module.FileSystem = FakeFileSystem
        fake_openai_chat_module.ChatOpenAI = FakeChatOpenAI

        def _import_module(name: str):
            if name == "browser_use.tools.service":
                return fake_service_module
            if name == "browser_use.browser":
                return fake_browser_module
            if name == "browser_use.filesystem.file_system":
                return fake_filesystem_module
            if name == "browser_use.llm.openai.chat":
                return fake_openai_chat_module
            raise ImportError(name)

        controller = SimpleNamespace(is_connected=True, _mode="managed", _cdp_url=None)

        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_USE_EXTRACTION_PROVIDER": "openai",
                "WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID": "gpt-5.1",
                "WINDIE_BROWSER_USE_EXTRACTION_API_KEY": "test-openai-key",
            },
            clear=False,
        ), mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=_import_module,
        ):
            handlers = get_native_runtime_handlers(controller=controller)
            result = await handlers["extract"](query="pricing")

        assert result["success"] is True
        assert result["native_source"] == "browser_use.tools"
        execute_action.assert_awaited_once()
        assert execute_action.await_args.kwargs["page_extraction_llm"].kwargs == {
            "model": "gpt-5.1",
            "api_key": "test-openai-key",
        }

    def test_runtime_factory_loads_handlers_from_custom_module(self, make_controller):
        controller = make_controller()
        custom_module = ModuleType("custom.native.handlers")
        custom_navigate = mock.AsyncMock(
            return_value={
                "success": True,
                "url": "https://native-module.example/nav",
                "title": "Native Module Navigate",
                "status": 209,
            }
        )
        custom_module.get_native_runtime_handlers = mock.Mock(
            return_value={
                "navigate": custom_navigate,
                "bad_entry": "not_callable",
            }
        )

        def _import_module(name: str):
            if name == "tools.browser.browser_tool":
                import tools.browser.browser_tool as runtime_module

                return runtime_module
            if name == "custom.native.handlers":
                return custom_module
            raise ImportError(name)

        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_USE_RUNTIME": "browser_use_native",
                "WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE": "custom.native.handlers",
            },
            clear=False,
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=_import_module,
        ), mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=_import_module,
        ):
            runtime = get_browser_runtime_provider(controller)

        assert runtime.__class__.__name__ == "BrowserUseNativeRuntimeProvider"
        assert "navigate" in runtime._native_handlers
        assert "bad_entry" not in runtime._native_handlers

    def test_runtime_factory_invalid_handler_module_raises(
        self,
        make_controller,
    ):
        controller = make_controller()
        invalid_module = ModuleType("custom.invalid.handlers")
        invalid_module.get_native_runtime_handlers = mock.Mock(return_value="not_a_mapping")

        def _import_module(name: str):
            if name == "tools.browser.browser_tool":
                import tools.browser.browser_tool as runtime_module

                return runtime_module
            if name == "custom.invalid.handlers":
                return invalid_module
            raise ImportError(name)

        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_USE_RUNTIME": "browser_use_native",
                "WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE": "custom.invalid.handlers",
            },
            clear=False,
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser.browser_tool.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=_import_module,
        ), mock.patch(
            "tools.browser.browser_tool.import_module",
            side_effect=_import_module,
        ):
            with pytest.raises(RuntimeError, match="returned non-mapping handlers"):
                get_browser_runtime_provider(controller)
