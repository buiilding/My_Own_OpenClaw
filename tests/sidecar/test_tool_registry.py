import sys
from pathlib import Path

import pytest


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from tools.registry import ToolRegistry  # noqa: E402
from tools.result import ToolResult  # noqa: E402


def test_registered_tools_match_exposed_tool_set():
    registry = ToolRegistry()
    registered = set(registry.tools.keys())
    exposed = ToolRegistry.get_exposed_tool_names()

    # Some exposed tools are optional at runtime (e.g. browser_control requires Playwright).
    optional_missing = {"browser_control"}
    missing_from_registered = sorted((exposed - registered) - optional_missing)
    extra_in_registered = sorted(registered - exposed)

    assert (registered | optional_missing) == exposed, (
        "Sidecar tool registry drift detected.\n"
        "All tools registered in the sidecar must be exposed to backend schemas, and vice versa.\n"
        f"Missing from registered tools: {missing_from_registered}\n"
        f"Extra registered tools (not exposed): {extra_in_registered}"
    )


@pytest.mark.asyncio
async def test_execute_tool_returns_error_for_missing_tool():
    registry = ToolRegistry()
    result = await registry.execute_tool("does_not_exist", {})
    assert result.success is False
    assert "Tool not found" in (result.error or "")


@pytest.mark.asyncio
async def test_execute_tool_passes_args_without_schema_validation():
    registry = ToolRegistry()
    captured = {}

    def read_file_tool(args):
        captured["args"] = args
        return ToolResult.success_result({"ok": True})

    registry.tools["read_file"] = read_file_tool

    result = await registry.execute_tool("read_file", {})
    assert result.success is True
    assert captured["args"] == {}


@pytest.mark.asyncio
async def test_execute_tool_coerces_non_dict_args_to_empty_dict():
    registry = ToolRegistry()
    captured = {}

    def read_file_tool(args):
        captured["args"] = args
        return ToolResult.success_result({"ok": True})

    registry.tools["read_file"] = read_file_tool

    result = await registry.execute_tool("read_file", "not-a-dict")
    assert result.success is True
    assert captured["args"] == {}


@pytest.mark.asyncio
async def test_execute_tool_handles_dict_results_and_errors():
    registry = ToolRegistry()

    registry.tools["read_file"] = lambda _args: {"success": True, "data": {"ok": True}}
    result = await registry.execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result.success is True
    assert result.data == {"ok": True}

    registry.tools["read_file"] = lambda _args: {"success": False, "error": "bad"}
    result = await registry.execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result.success is False
    assert result.error == "bad"


@pytest.mark.asyncio
async def test_execute_tool_handles_invalid_result_format():
    registry = ToolRegistry()
    registry.tools["read_file"] = lambda _args: "nope"
    result = await registry.execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result.success is False
    assert "invalid result format" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_execute_tool_handles_exceptions():
    registry = ToolRegistry()

    def boom(_args):
        raise RuntimeError("fail")

    registry.tools["read_file"] = boom
    result = await registry.execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result.success is False
    assert "Tool execution failed" in (result.error or "")
