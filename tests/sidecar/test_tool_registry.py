import sys
from pathlib import Path

import pytest


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from tools.registry import ToolRegistry  # noqa: E402
from tools.result import ToolResult  # noqa: E402
from tools.schemas import ReplaceArgs  # noqa: E402


@pytest.mark.asyncio
async def test_execute_tool_returns_error_for_missing_tool():
    registry = ToolRegistry()
    result = await registry.execute_tool("does_not_exist", {})
    assert result.success is False
    assert "Tool not found" in (result.error or "")


@pytest.mark.asyncio
async def test_execute_tool_validation_error_returns_tool_result():
    registry = ToolRegistry()
    registry.tools["read_file"] = lambda _args: ToolResult.success_result({"ok": True})

    result = await registry.execute_tool("read_file", {})
    assert result.success is False
    assert "Invalid arguments" in (result.error or "")


@pytest.mark.asyncio
async def test_execute_tool_passes_pydantic_model_for_replace():
    registry = ToolRegistry()
    captured = {}

    def replace_tool(args):
        captured["arg_type"] = type(args)
        return ToolResult.success_result({"ok": True})

    registry.tools["replace"] = replace_tool

    result = await registry.execute_tool(
        "replace",
        {"file_path": "/tmp/a", "old_string": "x", "new_string": "y"},
    )
    assert result.success is True
    assert captured["arg_type"] is ReplaceArgs


@pytest.mark.asyncio
async def test_execute_tool_converts_pydantic_to_dict_for_legacy_tools():
    registry = ToolRegistry()
    captured = {}

    def read_file_tool(args):
        captured["arg_type"] = type(args)
        captured["args"] = args
        return ToolResult.success_result({"ok": True})

    registry.tools["read_file"] = read_file_tool

    result = await registry.execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result.success is True
    assert captured["arg_type"] is dict
    assert captured["args"]["file_path"] == "/tmp/a"


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
