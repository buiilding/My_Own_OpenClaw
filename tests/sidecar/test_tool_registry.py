"""Covers tool registry behavior in the sidecar test suite."""

import pytest
from pathlib import Path
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from backend.src.tools.tool_catalog import get_client_executable_tool_names
from tools.registry import ToolRegistry  # noqa: E402
from tools.result import ToolResult  # noqa: E402


def test_tool_registry_copy_qualifies_python_sidecar_owner():
    repo_root = Path(__file__).resolve().parents[2]
    source_paths = [
        repo_root / "frontend" / "src" / "main" / "python" / "tools" / "registry.py",
        repo_root
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "tools"
        / "filesystem"
        / "read_file_tool.py",
        repo_root
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "tools"
        / "path_resolution.py",
        repo_root
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "tools"
        / "system"
        / "wait_tool.py",
    ]
    sources = "\n".join(path.read_text(encoding="utf-8") for path in source_paths)

    assert "Python sidecar runtime" in sources
    assert "Python sidecar tool" in sources
    assert "unavailable in sidecar runtime" not in sources
    assert "without restarting the sidecar runtime" not in sources
    assert "built-in sidecar tool" not in sources
    assert "Return sidecar tools" not in sources
    assert "built-in sidecar tools" not in sources
    assert "dependency in the sidecar runtime" not in sources
    assert "helpers for sidecar tools" not in sources
    assert "the sidecar tool doesn't" not in sources


def test_registered_tools_match_exposed_tool_set():
    registry = ToolRegistry()
    registered = set(registry.tools.keys())
    exposed = ToolRegistry.get_exposed_tool_names()

    optional_missing = {"browser"}
    missing_from_registered = sorted((exposed - registered) - optional_missing)
    extra_in_registered = sorted(registered - exposed)

    assert (registered | optional_missing) == exposed, (
        "Sidecar tool registry drift detected.\n"
        "All tools registered in the sidecar must be exposed to backend schemas, and vice versa.\n"
        f"Missing from registered tools: {missing_from_registered}\n"
        f"Extra registered tools (not exposed): {extra_in_registered}"
    )


def test_exposed_tool_names_are_derived_from_backend_catalog():
    assert ToolRegistry.get_exposed_tool_names() == set(
        get_client_executable_tool_names()
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
async def test_execute_tool_handles_invalid_result_format():
    registry = ToolRegistry()
    registry.tools["read_file"] = lambda _args: "nope"
    result = await registry.execute_tool("read_file", {"file_path": "/tmp/a"})
    assert result.success is False
    assert "invalid result format" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_execute_tool_rejects_mapping_result_format():
    registry = ToolRegistry()
    registry.tools["read_file"] = lambda _args: {"success": True, "data": {"ok": True}}

    result = await registry.execute_tool("read_file", {"file_path": "/tmp/a"})

    assert result.success is False
    assert result.error == "Tool returned invalid result format"


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
async def test_register_module_tool_loads_without_restart(
    tmp_path: Path,
    monkeypatch,
):
    package_dir = tmp_path / "my_project"
    package_dir.mkdir()
    (package_dir / "__init__.py").write_text("", encoding="utf-8")
    (package_dir / "tools.py").write_text(
        "\n".join(
            [
                "from tools.result import ToolResult",
                "",
                "async def save_note(text: str):",
                "    return ToolResult.success_result({'output': f'saved:{text}'})",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    registry = ToolRegistry()
    tool = registry.register_module_tool(
        name="save_note",
        module="my_project.tools:save_note",
        description="Save a local note.",
        schema={
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
            "additionalProperties": False,
        },
    )
    result = await registry.execute_tool("save_note", {"text": "hello"})
    manifest = registry.get_tool_manifest()

    assert tool["name"] == "save_note"
    assert result.success is True
    assert result.data == {"output": "saved:hello"}
    assert any(item["name"] == "save_note" for item in manifest["tools"])
