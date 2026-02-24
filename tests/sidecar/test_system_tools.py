import builtins
import sys
import types

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.system import stats_tool, wait_tool, window_tool  # noqa: E402


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


@pytest.mark.asyncio
async def test_switch_to_window_requires_tab_name():
    result = await window_tool.switch_to_window({})

    assert result == {"success": False, "error": "tab_name is required"}


@pytest.mark.asyncio
async def test_switch_to_window_success(monkeypatch):
    manager = FakeWindowManager(switch_result=True)
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await window_tool.switch_to_window({"tab_name": "Terminal"})

    assert result["success"] is True
    assert manager.switch_calls == ["Terminal"]
    assert result["data"]["tab_name"] == "Terminal"
    assert "Successfully switched" in result["data"]["llm_content"]


@pytest.mark.asyncio
async def test_switch_to_window_returns_not_found_error(monkeypatch):
    manager = FakeWindowManager(switch_result=False)
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await window_tool.switch_to_window({"tab_name": "Missing"})

    assert result["success"] is False
    assert "Could not find or switch" in result["error"]


@pytest.mark.asyncio
async def test_switch_to_window_handles_exceptions(monkeypatch):
    manager = FakeWindowManager(switch_error=RuntimeError("wm unavailable"))
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await window_tool.switch_to_window({"tab_name": "Terminal"})

    assert result["success"] is False
    assert "Tab switching operation failed" in result["error"]


@pytest.mark.asyncio
async def test_get_open_windows_filters_titles_case_insensitively(monkeypatch):
    manager = FakeWindowManager(
        windows=[
            {"title": "Terminal"},
            {"title": "Browser - docs"},
            {"title": "  "},
            {"title": "Editor"},
            {},
        ]
    )
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await window_tool.get_open_windows({"filter_text": "DOC"})

    assert result["success"] is True
    assert result["data"]["windows"] == ["Browser - docs"]
    assert result["data"]["llm_content"] == "- Browser - docs"


@pytest.mark.asyncio
async def test_get_open_windows_handles_manager_errors(monkeypatch):
    manager = FakeWindowManager(windows_error=RuntimeError("wm failed"))
    monkeypatch.setattr(window_tool, "_window_manager", manager)

    result = await window_tool.get_open_windows({})

    assert result["success"] is False
    assert "Failed to get open windows" in result["error"]


@pytest.mark.asyncio
async def test_get_system_stats_success_with_battery(monkeypatch):
    fake_psutil = types.SimpleNamespace(
        cpu_percent=lambda interval: 12.5,
        virtual_memory=lambda: types.SimpleNamespace(percent=44.2),
        sensors_battery=lambda: types.SimpleNamespace(percent=78, power_plugged=True),
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    result = await stats_tool.get_system_stats({})

    assert result["success"] is True
    stats = result["data"]["stats"]
    assert stats == {
        "cpu_percent": 12.5,
        "memory_percent": 44.2,
        "battery_percent": 78,
        "battery_charging": True,
    }
    assert '"cpu_percent": 12.5' in result["data"]["llm_content"]


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

    assert result["success"] is True
    stats = result["data"]["stats"]
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

    assert result == {"success": False, "error": "psutil library not available"}


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

    assert result["success"] is False
    assert "Failed to get system stats" in result["error"]


@pytest.mark.asyncio
async def test_wait_tool_validates_seconds_and_formats_status():
    default_result = await wait_tool.wait({})
    assert default_result["success"] is True
    assert default_result["data"]["status"] == "Waited for 1 second"

    custom_result = await wait_tool.wait({"seconds": 2.5})
    assert custom_result["success"] is True
    assert custom_result["data"]["status"] == "Waited for 2.5 seconds"
    assert custom_result["data"]["seconds_waited"] == 2.5

    invalid_type = await wait_tool.wait({"seconds": "soon"})
    assert invalid_type == {"success": False, "error": "seconds must be a non-negative number"}

    invalid_negative = await wait_tool.wait({"seconds": -1})
    assert invalid_negative == {"success": False, "error": "seconds must be a non-negative number"}


@pytest.mark.asyncio
async def test_wait_tool_exception_path_returns_failure():
    class BrokenArgs:
        def get(self, *_args, **_kwargs):
            raise RuntimeError("bad args")

    result = await wait_tool.wait(BrokenArgs())

    assert result["success"] is False
    assert "Wait operation failed" in result["error"]
