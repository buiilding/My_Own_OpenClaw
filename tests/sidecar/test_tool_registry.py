import pytest
from types import SimpleNamespace
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import tools.registry as registry_module  # noqa: E402
from tools.registry import ToolRegistry  # noqa: E402
from tools.result import ToolResult  # noqa: E402


def test_registered_tools_match_exposed_tool_set():
    registry = ToolRegistry()
    registered = set(registry.tools.keys())
    exposed = ToolRegistry.get_exposed_tool_names()

    # Some exposed tools are optional at runtime (e.g. browser requires Playwright).
    optional_missing = {"browser"}
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
async def test_execute_tool_rejects_non_dict_args():
    registry = ToolRegistry()
    captured = {"called": False}

    def read_file_tool(args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True})

    registry.tools["read_file"] = read_file_tool

    result = await registry.execute_tool("read_file", "not-a-dict")
    assert result.success is False
    assert result.error == "Tool args must be an object"
    assert captured["called"] is False


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

    registry.tools["read_file"] = lambda _args: {
        "success": False,
        "data": {
            "error": 'Usage: scripts/committer "<message>" <file> [file ...]',
            "exit_code": 1,
            "output": "",
        },
    }
    result = await registry.execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result.success is False
    assert result.error == 'Usage: scripts/committer "<message>" <file> [file ...]'
    assert result.data == {
        "error": 'Usage: scripts/committer "<message>" <file> [file ...]',
        "exit_code": 1,
        "output": "",
    }


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


@pytest.mark.asyncio
async def test_execute_computer_use_routes_to_selected_subtool():
    registry = ToolRegistry()
    captured = {}

    def mouse_tool(args):
        captured["args"] = args
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    result = await registry.execute_tool("computer_use", {
        "tool": "mouse_control",
        "metadata": {
            "description": "screen",
            "explanation": "click target",
            "expectation": "dialog opens",
        },
        "arguments": {
            "action": "click",
            "x": 12,
            "y": 34,
        },
    })

    assert result.success is True
    assert result.data == {"ok": True, "tool": "mouse_control"}
    assert captured["args"] == {"action": "click", "x": 12, "y": 34}


@pytest.mark.asyncio
async def test_execute_computer_use_rejects_missing_metadata():
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(_args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    result = await registry.execute_tool("computer_use", {
        "tool": "mouse_control",
        "arguments": {
            "action": "click",
            "x": 12,
            "y": 34,
        },
    })

    assert result.success is False
    assert "computer_use.metadata must be an object" == result.error
    assert captured["called"] is False


@pytest.mark.asyncio
async def test_execute_computer_use_rejects_whitespace_only_required_metadata_fields():
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(_args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    result = await registry.execute_tool("computer_use", {
        "tool": "mouse_control",
        "metadata": {
            "description": "   ",
            "explanation": "\n",
            "expectation": " \t ",
        },
        "arguments": {
            "action": "click",
            "x": 12,
            "y": 34,
        },
    })

    assert result.success is False
    assert "computer_use missing required metadata field: description" == result.error
    assert captured["called"] is False


@pytest.mark.asyncio
async def test_execute_computer_use_rejects_missing_required_metadata_field():
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(_args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    result = await registry.execute_tool("computer_use", {
        "tool": "mouse_control",
        "metadata": {
            "description": "screen",
            "explanation": "click target",
        },
        "arguments": {
            "action": "click",
            "x": 12,
            "y": 34,
        },
    })

    assert result.success is False
    assert "computer_use missing required metadata field: expectation" == result.error
    assert captured["called"] is False


@pytest.mark.asyncio
async def test_execute_computer_use_accepts_trimmed_required_metadata_fields():
    registry = ToolRegistry()
    captured = {}

    def mouse_tool(args):
        captured["args"] = args
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    result = await registry.execute_tool("computer_use", {
        "tool": "mouse_control",
        "metadata": {
            "description": " screen ",
            "explanation": " click target ",
            "expectation": " dialog opens ",
        },
        "arguments": {
            "action": "click",
            "x": 12,
            "y": 34,
        },
    })

    assert result.success is True
    assert result.data == {"ok": True, "tool": "mouse_control"}
    assert captured["args"] == {"action": "click", "x": 12, "y": 34}


@pytest.mark.asyncio
async def test_browser_tool_imports_module_lazily(monkeypatch):
    registry = ToolRegistry()
    import_calls = []

    async def fake_execute_browser(_args):
        return ToolResult.success_result({"ok": True})

    def fake_import_module(module_name):
        import_calls.append(module_name)
        return SimpleNamespace(execute_browser=fake_execute_browser)

    monkeypatch.setattr(registry_module, "import_module", fake_import_module)

    assert import_calls == []

    first_result = await registry.execute_tool("browser", {"action": "open"})
    second_result = await registry.execute_tool("browser", {"action": "close"})

    assert first_result.success is True
    assert second_result.success is True
    assert import_calls == ["tools.browser.browser_tool"]
