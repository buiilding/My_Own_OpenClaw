"""Covers local-runtime system tools behavior."""

import builtins
from pathlib import Path
import sys
import types

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.system import stats_tool, wait_tool, window_tool  # noqa: E402
from tools.result import ToolResult  # noqa: E402


async def _execute_window_tool(call):
    result = await call
    assert isinstance(result, ToolResult)
    return result.to_dict()


class FakeWindowManager:
    def __init__(self, *, windows=None, switch_result=True, switch_error=None, windows_error=None):
        self._windows = windows or []
        self._switch_result = switch_result
        self._switch_error = switch_error
        self._windows_error = windows_error
        self.switch_calls = []

    def switch_to_window(self, tab_name):
        if self._switch_error is not None:
            raise self._switch_error
        self.switch_calls.append(tab_name)
        return self._switch_result

    def get_windows(self):
        if self._windows_error is not None:
            raise self._windows_error
        return self._windows


def test_get_window_manager_creates_and_reuses_singleton(monkeypatch):
    created = []

    class _ConstructedManager(FakeWindowManager):
        def __init__(self):
            super().__init__()
            created.append(self)

    monkeypatch.setattr(window_tool, "_window_manager", None)
    monkeypatch.setattr(window_tool, "WindowManager", _ConstructedManager)

    first = window_tool._get_window_manager()
    second = window_tool._get_window_manager()

    assert first is second
    assert created == [first]


@pytest.mark.asyncio
async def test_switch_to_window_requires_tab_name():
    result = await _execute_window_tool(window_tool.switch_to_window({}))

    assert result["success"] is False
    assert result["error"] == "tab_name is required"


@pytest.mark.asyncio
async def test_switch_to_window_success(monkeypatch):
    manager = FakeWindowManager(
        windows=[{"title": "Terminal"}],
        switch_result=True,
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(
        window_tool.switch_to_window({"tab_name": "Terminal"})
    )

    assert result["success"] is True
    assert manager.switch_calls == ["Terminal"]
    assert result["data"]["tab_name"] == "Terminal"
    assert "Successfully switched" in result["data"]["output"]


@pytest.mark.asyncio
async def test_switch_to_window_returns_not_found_error(monkeypatch):
    manager = FakeWindowManager(windows=[{"title": "Other Window"}], switch_result=False)
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(
        window_tool.switch_to_window({"tab_name": "Missing"})
    )

    assert result["success"] is False
    assert "Could not find or switch" in result["error"]


@pytest.mark.asyncio
async def test_switch_to_window_handles_exceptions(monkeypatch):
    manager = FakeWindowManager(
        windows=[{"title": "Terminal"}],
        switch_error=RuntimeError("wm unavailable"),
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(
        window_tool.switch_to_window({"tab_name": "Terminal"})
    )

    assert result["success"] is False
    assert "Window switching operation failed" in result["error"]


@pytest.mark.asyncio
async def test_switch_to_window_supports_contains_match_mode(monkeypatch):
    manager = FakeWindowManager(
        windows=[{"title": "Browser - docs"}],
        switch_result=True,
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(
        window_tool.switch_to_window({"tab_name": "docs", "match_mode": "contains"})
    )

    assert result["success"] is True
    assert manager.switch_calls == ["Browser - docs"]


@pytest.mark.asyncio
async def test_switch_to_window_supports_app_name_matches(monkeypatch):
    manager = FakeWindowManager(
        windows=[{"title": "my prompts - Google Docs", "app_name": "Google Chrome"}],
        switch_result=True,
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(
        window_tool.switch_to_window(
            {"tab_name": "Google Chrome", "match_mode": "contains"}
        )
    )

    assert result["success"] is True
    assert manager.switch_calls == ["Google Chrome"]


@pytest.mark.asyncio
async def test_switch_to_window_supports_regex_match_mode(monkeypatch):
    manager = FakeWindowManager(
        windows=[{"title": "John Lennon - Beautiful Boy (Darling Boy) - Remastered 2010"}],
        switch_result=True,
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(
        window_tool.switch_to_window(
            {"tab_name": r"Beautiful Boy.*2010", "match_mode": "regex"}
        )
    )

    assert result["success"] is True
    assert manager.switch_calls == [
        "John Lennon - Beautiful Boy (Darling Boy) - Remastered 2010"
    ]


@pytest.mark.asyncio
async def test_switch_to_window_supports_duplicate_display_labels(monkeypatch):
    manager = FakeWindowManager(
        windows=[
            {
                "title": "New Tab - Google Chrome",
                "app_name": "Google Chrome",
                "hwnd": 11,
            },
            {
                "title": "New Tab - Google Chrome",
                "app_name": "Google Chrome",
                "hwnd": 22,
            },
        ],
        switch_result=True,
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(
        window_tool.switch_to_window(
            {"tab_name": "Google Chrome: New Tab - Google Chrome (2)"}
        )
    )

    assert result["success"] is True
    assert result["data"]["tab_name"] == "Google Chrome: New Tab - Google Chrome (2)"
    assert manager.switch_calls == [
        {
            "title": "New Tab - Google Chrome",
            "app_name": "Google Chrome",
            "hwnd": 22,
            "window_name": "New Tab - Google Chrome",
            "_switch_duplicate_index": 2,
            "_switch_duplicate_total": 2,
            "_switch_display_label": "Google Chrome: New Tab - Google Chrome (2)",
        }
    ]


@pytest.mark.asyncio
async def test_get_open_windows_prefers_app_names_and_includes_titles(monkeypatch):
    manager = FakeWindowManager(
        windows=[
            {"title": "my prompts - Google Docs", "app_name": "Google Chrome"},
            {"title": "u reverse - Google Search", "app_name": "Google Chrome"},
            {"title": "Terminal"},
            {"title": "  "},
            {"title": "Editor"},
            {},
        ]
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(window_tool.get_open_windows({}))

    assert result["success"] is True
    assert result["data"]["windows"] == [
        "Google Chrome: my prompts - Google Docs",
        "Google Chrome: u reverse - Google Search",
        "Terminal",
        "Editor",
    ]
    assert result["data"]["output"] == (
        "- Google Chrome: my prompts - Google Docs\n"
        "- Google Chrome: u reverse - Google Search\n"
        "- Terminal\n"
        "- Editor"
    )


@pytest.mark.asyncio
async def test_get_open_windows_filters_display_names_case_insensitively(monkeypatch):
    manager = FakeWindowManager(
        windows=[
            {"title": "my prompts - Google Docs", "app_name": "Google Chrome"},
            {"title": "Terminal"},
        ]
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(
        window_tool.get_open_windows({"filter_text": "chrome"})
    )

    assert result["success"] is True
    assert result["data"]["windows"] == ["Google Chrome: my prompts - Google Docs"]
    assert result["data"]["output"] == "- Google Chrome: my prompts - Google Docs"


@pytest.mark.asyncio
async def test_get_open_windows_preserves_duplicate_display_names(monkeypatch):
    manager = FakeWindowManager(
        windows=[
            {"title": "New Tab - Google Chrome", "app_name": "Google Chrome"},
            {"title": "New Tab - Google Chrome", "app_name": "Google Chrome"},
        ]
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(window_tool.get_open_windows({}))

    assert result["success"] is True
    assert result["data"]["windows"] == [
        "Google Chrome: New Tab - Google Chrome (1)",
        "Google Chrome: New Tab - Google Chrome (2)",
    ]
    assert result["data"]["output"] == (
        "- Google Chrome: New Tab - Google Chrome (1)\n"
        "- Google Chrome: New Tab - Google Chrome (2)"
    )


@pytest.mark.asyncio
async def test_get_open_windows_handles_manager_errors(monkeypatch):
    manager = FakeWindowManager(windows_error=RuntimeError("wm failed"))
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(window_tool.get_open_windows({}))

    assert result["success"] is False
    assert "Failed to get open windows" in result["error"]


@pytest.mark.asyncio
async def test_get_open_windows_returns_empty_state_message(monkeypatch):
    manager = FakeWindowManager(windows=[{"title": " "}, {"title": ""}, {}])
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await _execute_window_tool(window_tool.get_open_windows({}))

    assert result["success"] is True
    assert result["data"]["windows"] == []
    assert result["data"]["output"] == "No open windows found."


@pytest.mark.asyncio
async def test_get_system_stats_success_with_battery(monkeypatch):
    fake_psutil = types.SimpleNamespace(
        cpu_percent=lambda interval: 12.5,
        virtual_memory=lambda: types.SimpleNamespace(percent=44.2),
        sensors_battery=lambda: types.SimpleNamespace(percent=78, power_plugged=True),
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    result = await stats_tool.get_system_stats({})

    assert result.success is True
    assert result.data is not None
    stats = result.data["stats"]
    assert stats == {
        "cpu_percent": 12.5,
        "memory_percent": 44.2,
        "battery_percent": 78,
        "battery_charging": True,
    }
    assert '"cpu_percent": 12.5' in result.data["output"]


@pytest.mark.asyncio
async def test_get_system_stats_uses_shared_metrics_collector(monkeypatch):
    async def fake_collect():
        return {
            "cpu_percent": 7.5,
            "memory_percent": 22.0,
            "battery_percent": None,
            "battery_charging": None,
        }

    monkeypatch.setattr(stats_tool, "collect_system_stats", fake_collect)

    result = await stats_tool.get_system_stats({})

    assert result.success is True
    assert result.data is not None
    assert result.data["stats"]["cpu_percent"] == 7.5


@pytest.mark.asyncio
async def test_get_system_stats_without_battery_support(monkeypatch):
    def _raise_not_implemented():
        raise NotImplementedError

    fake_psutil = types.SimpleNamespace(
        cpu_percent=lambda interval: 8.0,
        virtual_memory=lambda: types.SimpleNamespace(percent=51.0),
        sensors_battery=_raise_not_implemented,
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    result = await stats_tool.get_system_stats({})

    assert result.success is True
    assert result.data is not None
    stats = result.data["stats"]
    assert stats["battery_percent"] is None
    assert stats["battery_charging"] is None


@pytest.mark.asyncio
async def test_get_system_stats_reports_import_error(monkeypatch):
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "psutil":
            raise ImportError("missing")
        return real_import(name, *args, **kwargs)

    monkeypatch.delitem(sys.modules, "psutil", raising=False)
    monkeypatch.setattr(builtins, "__import__", fake_import)

    result = await stats_tool.get_system_stats({})

    assert result.success is False
    assert result.error == "psutil library not available"


@pytest.mark.asyncio
async def test_get_system_stats_handles_runtime_exception(monkeypatch):
    def _cpu_percent(_interval):
        raise RuntimeError("bad metrics")

    fake_psutil = types.SimpleNamespace(
        cpu_percent=_cpu_percent,
        virtual_memory=lambda: types.SimpleNamespace(percent=51.0),
        sensors_battery=lambda: None,
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    result = await stats_tool.get_system_stats({})

    assert result.success is False
    assert "Failed to get system stats" in (result.error or "")


@pytest.mark.asyncio
async def test_wait_tool_validates_seconds_and_formats_status():
    missing_seconds = await wait_tool.wait({})
    assert missing_seconds.success is False
    assert missing_seconds.error == "seconds is required"

    custom_result = await wait_tool.wait({"seconds": 2.5})
    assert custom_result.success is True
    assert custom_result.data is not None
    assert custom_result.data["status"] == "Waited for 2.5 seconds"
    assert custom_result.data["seconds_waited"] == 2.5

    invalid_type = await wait_tool.wait({"seconds": "soon"})
    assert invalid_type.success is False
    assert invalid_type.error == "seconds must be a non-negative number"

    invalid_negative = await wait_tool.wait({"seconds": -1})
    assert invalid_negative.success is False
    assert invalid_negative.error == "seconds must be a non-negative number"


@pytest.mark.asyncio
async def test_wait_tool_formats_zero_and_integer_one_second_consistently():
    zero_result = await wait_tool.wait({"seconds": 0})
    assert zero_result.success is True
    assert zero_result.data is not None
    assert zero_result.data["seconds_waited"] == 0.0
    assert zero_result.data["status"] == "Waited for 0.0 seconds"
    assert zero_result.data["output"] == "status: Waited for 0.0 seconds"

    one_result = await wait_tool.wait({"seconds": 1})
    assert one_result.success is True
    assert one_result.data is not None
    assert one_result.data["seconds_waited"] == 1.0
    assert one_result.data["status"] == "Waited for 1 second"


def test_wait_tool_source_copy_uses_local_runtime_operations():
    source = Path(wait_tool.__file__).read_text(encoding="utf-8")

    assert "blocking local-runtime operations" in source
    assert "blocking sidecar " + "operations" not in source


@pytest.mark.asyncio
async def test_wait_tool_exception_path_returns_failure():
    class BrokenArgs:
        def get(self, *_args, **_kwargs):
            raise RuntimeError("bad args")

    result = await wait_tool.wait(BrokenArgs())

    assert result.success is False
    assert "Wait operation failed" in (result.error or "")
