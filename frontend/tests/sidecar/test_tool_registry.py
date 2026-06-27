"""Covers local-runtime tool registry behavior."""

import json
from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.registry import ToolRegistry  # noqa: E402
from tools.result import ToolResult  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATED_MANIFEST_PATH = (
    REPO_ROOT / "frontend" / "src" / "main" / "generated" / "builtin_tool_manifest.json"
)
LOCAL_RUNTIME_TOOL_TEST_LABEL_PATHS = [
    REPO_ROOT / "tests" / "sidecar" / "test_read_file_tool.py",
    REPO_ROOT / "tests" / "sidecar" / "test_replace_tool.py",
    REPO_ROOT / "tests" / "sidecar" / "test_replace_engine.py",
    REPO_ROOT / "tests" / "sidecar" / "test_shell_process_tool.py",
    REPO_ROOT / "tests" / "sidecar" / "test_shell_process_registry.py",
    REPO_ROOT / "tests" / "sidecar" / "test_shell_output_formatting.py",
    REPO_ROOT / "tests" / "sidecar" / "test_screenshot_tool.py",
    REPO_ROOT / "tests" / "sidecar" / "test_mouse_tool.py",
    REPO_ROOT / "tests" / "sidecar" / "test_keyboard_tool.py",
    REPO_ROOT / "tests" / "sidecar" / "test_open_app_tool.py",
    REPO_ROOT / "tests" / "sidecar" / "test_scroll_tool.py",
    REPO_ROOT / "tests" / "sidecar" / "test_scroll_config.py",
    REPO_ROOT / "tests" / "sidecar" / "test_system_tools.py",
    REPO_ROOT / "tests" / "sidecar" / "test_local_tool_output_contract.py",
    REPO_ROOT / "tests" / "sidecar" / "test_shared_tool_schema_parity.py",
    REPO_ROOT / "tests" / "sidecar" / "test_tool_registry.py",
    REPO_ROOT / "tests" / "sidecar" / "test_tool_schemas.py",
    REPO_ROOT / "tests" / "sidecar" / "test_tool_manifest.py",
    REPO_ROOT / "tests" / "sidecar" / "test_tool_result.py",
    REPO_ROOT / "tests" / "sidecar" / "tools" / "test_browser_schemas.py",
    REPO_ROOT / "tests" / "sidecar" / "tools" / "test_browser_file_store.py",
]


def test_local_runtime_tool_tests_use_boundary_docstrings():
    retired_suite_label = "behavior in the " + "sidecar test suite"
    retired_browser_schema_label = (
        "Sidecar " + "tests for the shared strict browser schema contract."
    )
    expected_headers = {
        "test_read_file_tool.py": '"""Covers local-runtime read-file tool behavior."""',
        "test_replace_tool.py": '"""Covers local-runtime replace tool behavior."""',
        "test_replace_engine.py": '"""Covers local-runtime replace engine behavior."""',
        "test_shell_process_tool.py": '"""Covers local-runtime shell process tool behavior."""',
        "test_shell_process_registry.py": '"""Covers local-runtime shell process registry behavior."""',
        "test_shell_output_formatting.py": '"""Covers local-runtime shell output formatting behavior."""',
        "test_screenshot_tool.py": '"""Covers local-runtime screenshot tool behavior."""',
        "test_mouse_tool.py": '"""Covers local-runtime mouse tool behavior."""',
        "test_keyboard_tool.py": '"""Covers local-runtime keyboard tool behavior."""',
        "test_open_app_tool.py": '"""Covers local-runtime open-app tool behavior."""',
        "test_scroll_tool.py": '"""Covers local-runtime scroll tool behavior."""',
        "test_scroll_config.py": '"""Covers local-runtime scroll config behavior."""',
        "test_system_tools.py": '"""Covers local-runtime system tools behavior."""',
        "test_local_tool_output_contract.py": '"""Covers local-runtime tool output contract behavior."""',
        "test_shared_tool_schema_parity.py": '"""Covers local-runtime shared tool schema parity behavior."""',
        "test_tool_registry.py": '"""Covers local-runtime tool registry behavior."""',
        "test_tool_schemas.py": '"""Covers local-runtime tool schema behavior."""',
        "test_tool_manifest.py": '"""Covers local-runtime tool manifest behavior."""',
        "test_tool_result.py": '"""Covers local-runtime tool result behavior."""',
        "test_browser_schemas.py": '"""Covers local-runtime browser schema contract behavior."""',
        "test_browser_file_store.py": '"""Covers local-runtime browser file store behavior."""',
    }

    for path in LOCAL_RUNTIME_TOOL_TEST_LABEL_PATHS:
        source = path.read_text(encoding="utf-8")
        assert source.splitlines()[0] == expected_headers[path.name]
        assert retired_suite_label not in source
        assert retired_browser_schema_label not in source


def test_tool_registry_copy_qualifies_python_local_runtime_owner():
    source_paths = [
        REPO_ROOT / "frontend" / "src" / "main" / "python" / "tools" / "registry.py",
        REPO_ROOT
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "tools"
        / "filesystem"
        / "read_file_tool.py",
        REPO_ROOT
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "tools"
        / "path_resolution.py",
        REPO_ROOT
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "tools"
        / "system"
        / "wait_tool.py",
    ]
    sources = "\n".join(path.read_text(encoding="utf-8") for path in source_paths)

    retired_runtime_label = "Python " + "sidecar runtime"
    retired_tool_label = "Python " + "sidecar tool"
    retired_sidecar_runtime_fragment = "sidecar " + "runtime"
    retired_builtin_tool_label = "built-in " + "sidecar tool"
    retired_sidecar_tools_label = "sidecar " + "tools"

    assert "Python local runtime" in sources
    assert "Python local-runtime tool" in sources
    assert retired_runtime_label not in sources
    assert retired_tool_label not in sources
    assert f"unavailable in {retired_sidecar_runtime_fragment}" not in sources
    assert f"without restarting the {retired_sidecar_runtime_fragment}" not in sources
    assert retired_builtin_tool_label not in sources
    assert f"Return {retired_sidecar_tools_label}" not in sources
    assert f"built-in {retired_sidecar_tools_label}" not in sources
    assert f"dependency in the {retired_sidecar_runtime_fragment}" not in sources
    assert f"helpers for {retired_sidecar_tools_label}" not in sources
    assert "the " + "sidecar tool doesn't" not in sources


def test_registered_tools_match_exposed_tool_set():
    registry = ToolRegistry()
    registered = set(registry.tools.keys())
    exposed = ToolRegistry.get_exposed_tool_names()

    optional_missing = {"browser"}
    missing_from_registered = sorted((exposed - registered) - optional_missing)
    extra_in_registered = sorted(registered - exposed)

    assert (registered | optional_missing) == exposed, (
        "Local-runtime tool registry drift detected.\n"
        "All local-runtime tools must be exposed to backend schemas, and vice versa.\n"
        f"Missing from registered tools: {missing_from_registered}\n"
        f"Extra registered tools (not exposed): {extra_in_registered}"
    )


def test_exposed_tool_names_match_generated_builtin_manifest():
    generated = json.loads(GENERATED_MANIFEST_PATH.read_text(encoding="utf-8"))
    generated_tool_names = {tool["name"] for tool in generated["tools"]}

    assert ToolRegistry.get_exposed_tool_names() == generated_tool_names


def test_local_runtime_registry_tests_do_not_import_backend_package():
    source = Path(__file__).read_text(encoding="utf-8")
    assert "backend" + ".src" not in source


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
