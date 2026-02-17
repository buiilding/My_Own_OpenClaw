"""Regression tests for the Browser Use compatibility adapter."""

from __future__ import annotations

from dataclasses import dataclass
from types import ModuleType
from types import SimpleNamespace
from unittest import mock

import pytest

from tools.browser_use_adapter import BrowserUseCompatibilityAdapter
from tools.browser_use_adapter.runtime_provider import get_browser_runtime_provider
from tools.browser_use_adapter.browser_use_native_handlers import (
    get_native_runtime_handlers,
)
from tools.browser_use_adapter.browser_use_native_runtime import (
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
        return controller

    return _make_controller


class TestBrowserUseCompatibilityAdapter:
    @pytest.mark.asyncio
    async def test_execute_unknown_action_returns_unsupported(self, make_controller):
        adapter = BrowserUseCompatibilityAdapter(make_controller())

        result = await adapter.execute("unknown_action", {})

        assert result.success is False
        assert result.action == "unknown_action"
        assert result.error_code == "ACTION_UNSUPPORTED"

    @pytest.mark.asyncio
    async def test_snapshot_requires_connection(self, make_controller):
        adapter = BrowserUseCompatibilityAdapter(make_controller(connected=False))

        result = await adapter.execute("snapshot", {"action": "snapshot"})

        assert result.success is False
        assert result.action == "snapshot"
        assert result.error_code == "BROWSER_NOT_CONNECTED"

    @pytest.mark.asyncio
    async def test_snapshot_rejects_efficient_mode_for_aria(self, make_controller):
        adapter = BrowserUseCompatibilityAdapter(make_controller())

        result = await adapter.execute(
            "snapshot",
            {"action": "snapshot", "format": "aria", "mode": "efficient"},
        )

        assert result.success is False
        assert result.action == "snapshot"
        assert result.error_code == "INVALID_ARGUMENT"
        assert "requires format='ai'" in (result.error or "")

    @pytest.mark.asyncio
    async def test_snapshot_paginates_and_retries_on_zero_refs(self, make_controller):
        controller = make_controller()
        full_text = "x" * 6000
        controller.get_page_snapshot.side_effect = [
            DummySnapshot(
                text=full_text,
                url="https://example.com/page",
                title="Example",
                ref_count=0,
            ),
            DummySnapshot(
                text=full_text,
                url="https://example.com/page",
                title="Example",
                ref_count=3,
            ),
        ]
        adapter = BrowserUseCompatibilityAdapter(controller)

        result = await adapter.execute(
            "snapshot",
            {
                "action": "snapshot",
                "format": "ai",
                "offset": 4500,
                "limit": 300,
            },
        )

        assert result.success is True
        assert result.action == "snapshot"
        assert result.data["wait_until"] == "load"
        assert result.data["snapshot"] == full_text[4500:4800]
        assert result.data["returned_chars"] == 300
        assert result.data["total_chars"] == len(full_text)
        assert result.data["has_more"] is True
        assert result.data["next_offset"] == 4800

        assert controller.get_page_snapshot.await_count == 2
        first_call = controller.get_page_snapshot.await_args_list[0].kwargs
        second_call = controller.get_page_snapshot.await_args_list[1].kwargs
        assert first_call["max_chars"] == 5312
        assert first_call["depth"] == 4
        assert first_call["interactive"] is True
        assert first_call["compact"] is True
        assert second_call["depth"] == 12

    @pytest.mark.asyncio
    async def test_snapshot_rejects_window_above_cap(self, make_controller):
        controller = make_controller()
        adapter = BrowserUseCompatibilityAdapter(controller)

        result = await adapter.execute(
            "snapshot",
            {
                "action": "snapshot",
                "format": "ai",
                "offset": 119_500,
                "limit": 1_000,
            },
        )

        assert result.success is False
        assert result.error_code == "INVALID_ARGUMENT"
        assert "offset + limit exceeds maximum snapshot window" in (result.error or "")
        controller.get_page_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_extract_structured_mode_returns_structured_payload(self, make_controller):
        controller = make_controller()
        controller.evaluate.return_value = {
            "success": True,
            "result": {
                "title": "Example",
                "url": "https://example.com/table",
                "content": "Page Text:\nIgnored in structured mode",
                "structured": {
                    "tables": [
                        {
                            "index": 1,
                            "headers": ["Name", "Role"],
                            "rows": [["A", "Engineer"]],
                        }
                    ],
                    "lists": [],
                },
            },
        }
        adapter = BrowserUseCompatibilityAdapter(controller)

        result = await adapter.execute(
            "extract",
            {
                "action": "extract",
                "query": "engineer",
                "mode": "structured",
            },
        )

        assert result.success is True
        assert result.action == "extract"
        assert result.data["mode"] == "structured"
        assert "tables" in result.data["result"]
        assert result.data["structured"]["tables"][0]["headers"] == ["Name", "Role"]

    @pytest.mark.asyncio
    async def test_extract_rejects_invalid_mode(self, make_controller):
        adapter = BrowserUseCompatibilityAdapter(make_controller())

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
        assert "mode must be one of" in (result.error or "")

    @pytest.mark.asyncio
    async def test_act_click_routes_to_click_action_result(self, make_controller):
        controller = make_controller()
        adapter = BrowserUseCompatibilityAdapter(controller)

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

        assert result.success is True
        assert result.action == "click"
        assert result.data["action"] == "click"
        controller.click.assert_awaited_once_with(
            ref="e1",
            double_click=False,
            button="left",
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

        adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

        status_result = await adapter.execute("status", {"action": "status"})
        assert status_result.success is True
        assert status_result.data["url"] == "https://runtime.example/status"
        runtime.get_status.assert_awaited_once()

        navigate_result = await adapter.execute(
            "navigate",
            {
                "action": "navigate",
                "target_id": "tab-2",
                "url": "https://runtime.example/nav",
            },
        )
        assert navigate_result.success is True
        assert navigate_result.data["url"] == "https://runtime.example/nav"
        runtime.switch_tab.assert_awaited_once_with("tab-2")
        runtime.navigate.assert_awaited_once_with(
            url="https://runtime.example/nav",
            wait_until="load",
        )

        open_result = await adapter.execute(
            "open",
            {"action": "open", "url": "https://runtime.example/new"},
        )
        assert open_result.success is True
        assert open_result.data["target_id"] == "tab-2"
        runtime.open_tab.assert_awaited_once_with(url="https://runtime.example/new")

        tabs_result = await adapter.execute("get_tabs", {"action": "get_tabs"})
        assert tabs_result.success is True
        assert tabs_result.data["tab_count"] == 2
        assert tabs_result.data["tabs"][0]["target_id"] == "tab-1"
        assert tabs_result.data["tabs"][1]["target_id"] == "tab-2"
        runtime.get_tabs.assert_awaited_once()

        switch_result = await adapter.execute(
            "switch_tab",
            {"action": "switch_tab", "target_id": "tab-1"},
        )
        assert switch_result.success is True
        assert switch_result.data["target_id"] == "tab-1"
        assert runtime.switch_tab.await_count == 2

        close_result = await adapter.execute("close", {"action": "close"})
        assert close_result.success is True
        runtime.close.assert_awaited_once()

        click_result = await adapter.execute("click", {"action": "click", "ref": "e1"})
        assert click_result.success is True
        runtime.click.assert_awaited_once_with(
            ref="e1",
            double_click=False,
            button="left",
        )

        wait_result = await adapter.execute("wait", {"action": "wait", "state": "load"})
        assert wait_result.success is True
        assert wait_result.data["type"] == "load_state"

        timed_wait_result = await adapter.execute(
            "wait",
            {"action": "wait", "seconds": 2.5},
        )
        assert timed_wait_result.success is True
        assert timed_wait_result.data["type"] == "time"
        runtime.wait_seconds.assert_awaited_once_with(seconds=2.5)

        evaluate_result = await adapter.execute(
            "evaluate",
            {"action": "evaluate", "script": "1 + 1"},
        )
        assert evaluate_result.success is True
        runtime.evaluate.assert_awaited_with(script="1 + 1")

        upload_result = await adapter.execute(
            "upload",
            {"action": "upload", "ref": "e1", "paths": ["/tmp/file.txt"]},
        )
        assert upload_result.success is True
        runtime.set_input_files.assert_awaited_once_with(
            ref="e1",
            paths=["/tmp/file.txt"],
        )

        snapshot_result = await adapter.execute(
            "snapshot",
            {"action": "snapshot", "format": "ai"},
        )
        assert snapshot_result.success is True
        assert snapshot_result.data["snapshot"] == "runtime snapshot"
        runtime.get_page_snapshot.assert_awaited()

    def test_runtime_factory_falls_back_to_controller_provider(self, make_controller):
        controller = make_controller()
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_USE_RUNTIME": "browser_use_native"},
            clear=False,
        ):
            runtime = get_browser_runtime_provider(controller)

        assert runtime.__class__.__name__ == "ControllerBackedRuntimeProvider"

    def test_runtime_factory_browser_use_strict_raises_when_unavailable(
        self,
        make_controller,
    ):
        controller = make_controller()
        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_USE_RUNTIME": "browser_use_native",
                "WINDIE_BROWSER_USE_RUNTIME_STRICT": "1",
            },
            clear=False,
        ):
            with pytest.raises(RuntimeError, match="unavailable"):
                get_browser_runtime_provider(controller)

    def test_runtime_factory_unknown_runtime_strict_raises(self, make_controller):
        controller = make_controller()
        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_USE_RUNTIME": "unknown_runtime",
                "WINDIE_BROWSER_USE_RUNTIME_STRICT": "true",
            },
            clear=False,
        ):
            with pytest.raises(RuntimeError, match="Unknown browser runtime"):
                get_browser_runtime_provider(controller)

    def test_runtime_factory_import_failure_falls_back_without_strict(
        self,
        make_controller,
    ):
        controller = make_controller()
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_USE_RUNTIME": "browser_use_native"},
            clear=False,
        ), mock.patch(
            "tools.browser_use_adapter.runtime_provider.import_module",
            side_effect=ImportError("simulated import failure"),
        ):
            runtime = get_browser_runtime_provider(controller)

        assert runtime.__class__.__name__ == "ControllerBackedRuntimeProvider"

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
            "tools.browser_use_adapter.browser_use_native_runtime.find_spec",
            return_value=object(),
        ):
            runtime = get_browser_runtime_provider(controller)

        assert runtime.__class__.__name__ == "BrowserUseNativeRuntimeProvider"
        assert runtime._native_handlers == {}

    @pytest.mark.asyncio
    async def test_native_provider_uses_enabled_handler_for_navigate(
        self,
        make_controller,
    ):
        controller = make_controller()
        native_navigate = mock.AsyncMock(
            return_value={
                "success": True,
                "url": "https://native.example/nav",
                "title": "Native Navigate",
                "status": 202,
            }
        )
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_USE_NATIVE_ACTIONS": "navigate"},
            clear=False,
        ):
            provider = BrowserUseNativeRuntimeProvider(
                controller,
                native_handlers={"navigate": native_navigate},
            )

        result = await provider.navigate(
            url="https://native.example/nav",
            wait_until="load",
        )

        assert result["status"] == 202
        native_navigate.assert_awaited_once_with(
            url="https://native.example/nav",
            wait_until="load",
        )
        controller.navigate.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_native_provider_falls_back_when_action_not_enabled(
        self,
        make_controller,
    ):
        controller = make_controller()
        native_navigate = mock.AsyncMock(
            return_value={"success": True, "url": "https://native.example", "title": "", "status": 204}
        )
        with mock.patch.dict("os.environ", {}, clear=True):
            provider = BrowserUseNativeRuntimeProvider(
                controller,
                native_handlers={"navigate": native_navigate},
            )

        result = await provider.navigate(url="https://example.com", wait_until="load")

        assert result["status"] == 200
        native_navigate.assert_not_awaited()
        controller.navigate.assert_awaited_once_with("https://example.com", "load")

    @pytest.mark.asyncio
    async def test_native_provider_strict_raises_without_handler(
        self,
        make_controller,
    ):
        controller = make_controller()
        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_USE_NATIVE_ACTIONS": "navigate",
                "WINDIE_BROWSER_USE_NATIVE_ACTIONS_STRICT": "1",
            },
            clear=False,
        ):
            provider = BrowserUseNativeRuntimeProvider(controller)

        with pytest.raises(RuntimeError, match="no native handler"):
            await provider.navigate(url="https://example.com", wait_until="load")

    @pytest.mark.asyncio
    async def test_native_provider_enabled_overrides_for_interaction_methods(
        self,
        make_controller,
    ):
        controller = make_controller()
        controller.click = mock.AsyncMock(
            side_effect=AssertionError("controller.click should not be called")
        )
        controller.wait_for_load = mock.AsyncMock(
            side_effect=AssertionError("controller.wait_for_load should not be called")
        )
        controller.get_page_snapshot = mock.AsyncMock(
            side_effect=AssertionError("controller.get_page_snapshot should not be called")
        )
        controller.set_input_files = mock.AsyncMock(
            side_effect=AssertionError("controller.set_input_files should not be called")
        )
        controller.auto_connect_to_chrome = mock.AsyncMock(
            side_effect=AssertionError("controller.auto_connect_to_chrome should not be called")
        )

        snapshot_obj = DummySnapshot(
            text="native snapshot",
            url="https://native.example/snapshot",
            title="Native Snapshot",
            ref_count=5,
        )
        native_handlers = {
            "click": mock.AsyncMock(return_value={"success": True, "method": "native"}),
            "wait": mock.AsyncMock(return_value={"success": True}),
            "snapshot": mock.AsyncMock(return_value=snapshot_obj),
            "upload": mock.AsyncMock(return_value={"success": True, "uploaded_count": 2}),
            "connect_user_chrome": mock.AsyncMock(
                return_value={
                    "status": "connected",
                    "mode": "user_chrome",
                    "url": "https://native.example",
                    "title": "Native",
                    "auto_launched": False,
                }
            ),
        }

        with mock.patch.dict(
            "os.environ",
            {
                "WINDIE_BROWSER_USE_NATIVE_ACTIONS": "click,wait,snapshot,upload,connect_user_chrome",
            },
            clear=False,
        ):
            provider = BrowserUseNativeRuntimeProvider(
                controller,
                native_handlers=native_handlers,
            )

        click_result = await provider.click(ref="e1", double_click=False, button="left")
        assert click_result["method"] == "native"

        wait_result = await provider.wait_for_load(state="load")
        assert wait_result["success"] is True

        snapshot_result = await provider.get_page_snapshot(format_type="ai")
        assert snapshot_result.text == "native snapshot"

        upload_result = await provider.set_input_files(ref="e1", paths=["/tmp/file.txt"])
        assert upload_result["uploaded_count"] == 2

        connect_result = await provider.connect_user_chrome(
            cdp_url="http://127.0.0.1:9222",
            auto_launch=True,
        )
        assert connect_result["url"] == "https://native.example"

    @pytest.mark.asyncio
    async def test_native_provider_uses_enabled_wait_seconds_handler(
        self,
        make_controller,
    ):
        controller = make_controller()
        native_wait_seconds = mock.AsyncMock(
            return_value={
                "success": True,
                "native_source": "browser_use.tools.wait",
            }
        )
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_USE_NATIVE_ACTIONS": "wait_seconds"},
            clear=False,
        ):
            provider = BrowserUseNativeRuntimeProvider(
                controller,
                native_handlers={"wait_seconds": native_wait_seconds},
            )

        result = await provider.wait_seconds(seconds=2.5)

        assert result["success"] is True
        assert result["native_source"] == "browser_use.tools.wait"
        native_wait_seconds.assert_awaited_once_with(seconds=2.5)

    @pytest.mark.asyncio
    async def test_default_native_handler_registry_includes_browser_use_wait_seconds(
        self,
    ):
        fake_service_module = ModuleType("browser_use.tools.service")
        execute_action = mock.AsyncMock(
            return_value=SimpleNamespace(extracted_content="Waited for 2 seconds")
        )

        class FakeTools:
            def __init__(self):
                self.registry = SimpleNamespace(execute_action=execute_action)

        fake_service_module.Tools = FakeTools

        def _import_module(name: str):
            if name == "browser_use.tools.service":
                return fake_service_module
            raise ImportError(name)

        with mock.patch(
            "tools.browser_use_adapter.browser_use_native_handlers.import_module",
            side_effect=_import_module,
        ):
            handlers = get_native_runtime_handlers()

        assert "wait_seconds" in handlers
        result = await handlers["wait_seconds"](seconds=2.2)
        assert result["success"] is True
        assert result["native_source"] == "browser_use.tools.wait"
        execute_action.assert_awaited_once_with(
            "wait",
            {"seconds": 2},
            browser_session=None,
        )

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
            if name == "tools.browser_use_adapter.browser_use_native_runtime":
                import tools.browser_use_adapter.browser_use_native_runtime as runtime_module

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
            "tools.browser_use_adapter.browser_use_native_runtime.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser_use_adapter.browser_use_native_runtime.import_module",
            side_effect=_import_module,
        ), mock.patch(
            "tools.browser_use_adapter.runtime_provider.import_module",
            side_effect=_import_module,
        ):
            runtime = get_browser_runtime_provider(controller)

        assert runtime.__class__.__name__ == "BrowserUseNativeRuntimeProvider"
        assert "navigate" in runtime._native_handlers
        assert "bad_entry" not in runtime._native_handlers

    def test_runtime_factory_invalid_handler_module_falls_back_to_empty_handlers(
        self,
        make_controller,
    ):
        controller = make_controller()
        invalid_module = ModuleType("custom.invalid.handlers")
        invalid_module.get_native_runtime_handlers = mock.Mock(return_value="not_a_mapping")

        def _import_module(name: str):
            if name == "tools.browser_use_adapter.browser_use_native_runtime":
                import tools.browser_use_adapter.browser_use_native_runtime as runtime_module

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
            "tools.browser_use_adapter.browser_use_native_runtime.find_spec",
            return_value=object(),
        ), mock.patch(
            "tools.browser_use_adapter.browser_use_native_runtime.import_module",
            side_effect=_import_module,
        ), mock.patch(
            "tools.browser_use_adapter.runtime_provider.import_module",
            side_effect=_import_module,
        ):
            runtime = get_browser_runtime_provider(controller)

        assert runtime.__class__.__name__ == "BrowserUseNativeRuntimeProvider"
        assert runtime._native_handlers == {}
