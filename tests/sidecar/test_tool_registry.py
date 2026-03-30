import pytest
from types import SimpleNamespace
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from backend.src.tools.tool_catalog import (
    get_backend_exposed_tool_names,
    get_wrapper_member_names,
)
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


def test_exposed_tool_names_are_derived_from_backend_catalog():
    assert ToolRegistry.get_exposed_tool_names() == set(get_backend_exposed_tool_names())


def test_sidecar_wrapper_membership_matches_backend_catalog():
    assert registry_module.COMPUTER_USE_SUBTOOLS == set(get_wrapper_member_names("computer_use"))
    assert registry_module.SYSTEM_USE_SUBTOOLS == set(get_wrapper_member_names("system_use"))


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
async def test_execute_computer_use_accepts_trimmed_subtool_name():
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(args):
        captured["called"] = True
        captured["args"] = args
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool
    envelope = {
        "tool": " mouse_control ",
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
    }

    result = await registry.execute_tool("computer_use", envelope)

    assert result.success is True
    assert result.data == {"ok": True, "tool": "mouse_control"}
    assert captured["called"] is True
    assert captured["args"] == {"action": "click", "x": 12, "y": 34}


@pytest.mark.asyncio
async def test_execute_computer_use_rejects_whitespace_only_subtool_name_after_trim():
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(_args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool
    envelope = {
        "tool": "   ",
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
    }

    result = await registry.execute_tool("computer_use", envelope)

    assert result.success is False
    assert "computer_use requires a valid 'tool' value" in (result.error or "")
    assert captured["called"] is False


@pytest.mark.asyncio
async def test_execute_computer_use_rejects_unknown_subtool_name():
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(_args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    result = await registry.execute_tool("computer_use", {
        "tool": "mouse_control_typo",
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

    assert result.success is False
    assert "computer_use requires a valid 'tool' value" in (result.error or "")
    assert captured["called"] is False


@pytest.mark.asyncio
async def test_execute_computer_use_rejects_non_object_arguments():
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
            "expectation": "dialog opens",
        },
        "arguments": "not-a-dict",
    })

    assert result.success is False
    assert result.error == "computer_use.arguments must be an object"
    assert captured["called"] is False


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
@pytest.mark.parametrize("missing_field", ["description", "explanation", "expectation"])
async def test_execute_computer_use_rejects_missing_required_metadata_field(missing_field):
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(_args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    metadata = {
        "description": "screen",
        "explanation": "click target",
        "expectation": "dialog opens",
    }
    metadata.pop(missing_field)

    result = await registry.execute_tool(
        "computer_use",
        {
            "tool": "mouse_control",
            "metadata": metadata,
            "arguments": {
                "action": "click",
                "x": 12,
                "y": 34,
            },
        },
    )

    assert result.success is False
    assert f"computer_use missing required metadata field: {missing_field}" == result.error
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
async def test_execute_computer_use_rejects_non_required_metadata_fields_before_subtool_execution():
    registry = ToolRegistry()
    captured = {}

    def mouse_tool(args):
        captured["args"] = args
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool
    envelope = {
        "tool": "mouse_control",
        "metadata": {
            "description": "screen",
            "explanation": "click target",
            "expectation": "dialog opens",
            "extra_debug_field": "drop-me",
        },
        "arguments": {
            "action": "click",
            "x": 12,
            "y": 34,
        },
    }

    result = await registry.execute_tool("computer_use", envelope)

    assert result.success is False
    assert result.error == "computer_use.metadata contains unexpected fields: extra_debug_field"
    assert envelope["metadata"] == {
        "description": "screen",
        "explanation": "click target",
        "expectation": "dialog opens",
        "extra_debug_field": "drop-me",
    }
    assert "args" not in captured


@pytest.mark.asyncio
async def test_execute_computer_use_reports_unexpected_metadata_fields_in_sorted_order():
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(_args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    result = await registry.execute_tool(
        "computer_use",
        {
            "tool": "mouse_control",
            "metadata": {
                "description": "screen",
                "explanation": "click target",
                "expectation": "dialog opens",
                "z_debug": "z",
                "a_debug": "a",
            },
            "arguments": {
                "action": "click",
                "x": 12,
                "y": 34,
            },
        },
    )

    assert result.success is False
    assert result.error == "computer_use.metadata contains unexpected fields: a_debug, z_debug"
    assert captured["called"] is False


@pytest.mark.asyncio
async def test_execute_computer_use_prevents_subtool_argument_mutation_from_leaking_to_envelope():
    registry = ToolRegistry()
    captured = {}

    def mutating_mouse_tool(args):
        captured["before"] = {
            "action": args.get("action"),
            "x": args.get("x"),
            "nested": dict(args.get("nested", {})),
        }
        args["x"] = 999
        nested = args.get("nested")
        if isinstance(nested, dict):
            nested["candidate_id"] = "mutated"
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mutating_mouse_tool
    envelope = {
        "tool": "mouse_control",
        "metadata": {
            "description": "screen",
            "explanation": "click target",
            "expectation": "dialog opens",
        },
        "arguments": {
            "action": "click",
            "x": 12,
            "nested": {"candidate_id": "cand-1"},
        },
    }

    result = await registry.execute_tool("computer_use", envelope)

    assert result.success is True
    assert captured["before"] == {
        "action": "click",
        "x": 12,
        "nested": {"candidate_id": "cand-1"},
    }
    assert envelope["arguments"] == {
        "action": "click",
        "x": 12,
        "nested": {"candidate_id": "cand-1"},
    }


@pytest.mark.asyncio
async def test_execute_computer_use_rejects_legacy_nested_arguments_metadata_wrapper():
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(_args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    result = await registry.execute_tool("computer_use", {
        "tool": "mouse_control",
        "arguments": {
            "metadata": {
                "description": "screen",
                "explanation": "click target",
                "expectation": "dialog opens",
            },
            "action": "click",
            "x": 12,
            "y": 34,
        },
    })

    assert result.success is False
    assert "computer_use.metadata must be an object" == result.error
    assert captured["called"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("invalid_field", "invalid_value"),
    [("description", 123), ("explanation", {"why": "click"}), ("expectation", ["dialog"])],
)
async def test_execute_computer_use_rejects_non_string_required_metadata_fields(
    invalid_field, invalid_value
):
    registry = ToolRegistry()
    captured = {"called": False}

    def mouse_tool(_args):
        captured["called"] = True
        return ToolResult.success_result({"ok": True, "tool": "mouse_control"})

    registry.tools["mouse_control"] = mouse_tool

    metadata = {
        "description": "screen",
        "explanation": "click target",
        "expectation": "dialog opens",
    }
    metadata[invalid_field] = invalid_value

    result = await registry.execute_tool(
        "computer_use",
        {
            "tool": "mouse_control",
            "metadata": metadata,
            "arguments": {
                "action": "click",
                "x": 12,
                "y": 34,
            },
        },
    )

    assert result.success is False
    assert f"computer_use missing required metadata field: {invalid_field}" == result.error
    assert captured["called"] is False


@pytest.mark.asyncio
async def test_execute_system_use_routes_to_selected_subtool():
    registry = ToolRegistry()
    captured = {}

    def shell_tool(args):
        captured["args"] = args
        return ToolResult.success_result({"ok": True, "tool": "run_shell_command"})

    registry.tools["run_shell_command"] = shell_tool

    result = await registry.execute_tool(
        "system_use",
        {
            "tool": "run_shell_command",
            "explanation": "verify route",
            "arguments": {
                "command": "echo hi",
                "run_in_background": False,
            },
        },
    )

    assert result.success is True
    assert result.data == {"ok": True, "tool": "run_shell_command"}
    assert captured["args"] == {
        "command": "echo hi",
        "run_in_background": False,
        "explanation": "verify route",
    }


@pytest.mark.asyncio
async def test_execute_system_use_routes_replace_to_replace():
    registry = ToolRegistry()
    captured = {"called": False}

    def replace_tool(args):
        captured["called"] = True
        captured["args"] = args
        return ToolResult.success_result({"ok": True, "tool": "replace"})

    registry.tools["replace"] = replace_tool

    result = await registry.execute_tool(
        "system_use",
        {
            "tool": "replace",
            "explanation": "patch",
            "arguments": {
                "file_path": "/tmp/a.txt",
                "old_string": "x",
                "new_string": "y",
            },
        },
    )

    assert result.success is True
    assert result.data == {"ok": True, "tool": "replace"}
    assert captured["called"] is True
    assert captured["args"] == {
        "file_path": "/tmp/a.txt",
        "old_string": "x",
        "new_string": "y",
        "explanation": "patch",
    }


@pytest.mark.asyncio
async def test_execute_system_use_rejects_missing_top_level_explanation():
    registry = ToolRegistry()

    result = await registry.execute_tool(
        "system_use",
        {
            "tool": "replace",
            "arguments": {
                "file_path": "/tmp/a.txt",
                "old_string": "x",
                "new_string": "y",
                "explanation": "legacy nested",
            },
        },
    )

    assert result.success is False
    assert result.error == "system_use.explanation must be a non-empty string"


@pytest.mark.asyncio
async def test_execute_system_use_prefers_top_level_explanation_over_nested_fallback():
    registry = ToolRegistry()
    captured = {"called": False}

    def replace_tool(args):
        captured["called"] = True
        captured["args"] = args
        return ToolResult.success_result({"ok": True, "tool": "replace"})

    registry.tools["replace"] = replace_tool

    result = await registry.execute_tool(
        "system_use",
        {
            "tool": "replace",
            "explanation": "canonical top-level",
            "arguments": {
                "file_path": "/tmp/a.txt",
                "old_string": "x",
                "new_string": "y",
                "explanation": "legacy nested",
            },
        },
    )

    assert result.success is True
    assert captured["called"] is True
    assert captured["args"] == {
        "file_path": "/tmp/a.txt",
        "old_string": "x",
        "new_string": "y",
        "explanation": "canonical top-level",
    }


@pytest.mark.asyncio
async def test_execute_system_use_run_shell_preserves_sudo_auth_mode_in_arguments():
    registry = ToolRegistry()
    captured = {"called": False}

    def shell_tool(args):
        captured["called"] = True
        captured["args"] = args
        return ToolResult.success_result({"ok": True, "tool": "run_shell_command"})

    registry.tools["run_shell_command"] = shell_tool

    result = await registry.execute_tool(
        "system_use",
        {
            "tool": "run_shell_command",
            "explanation": "run privileged command",
            "arguments": {
                "command": "sudo apt update",
                "run_in_background": False,
                "sudo_auth_mode": "native",
            },
        },
    )

    assert result.success is True
    assert captured["called"] is True
    assert captured["args"] == {
        "command": "sudo apt update",
        "run_in_background": False,
        "sudo_auth_mode": "native",
        "explanation": "run privileged command",
    }


@pytest.mark.asyncio
async def test_execute_system_use_rejects_unknown_subtool_name():
    registry = ToolRegistry()

    result = await registry.execute_tool(
        "system_use",
        {
            "tool": "unknown_system_tool",
            "arguments": {},
        },
    )

    assert result.success is False
    assert "system_use requires a valid 'tool' value" in (result.error or "")


@pytest.mark.asyncio
async def test_execute_system_use_rejects_non_object_arguments():
    registry = ToolRegistry()

    result = await registry.execute_tool(
        "system_use",
        {
            "tool": "read_file",
            "arguments": "not-a-dict",
        },
    )

    assert result.success is False
    assert result.error == "system_use.arguments must be an object"


@pytest.mark.asyncio
async def test_execute_system_use_prevents_subtool_argument_mutation_from_leaking_to_envelope():
    registry = ToolRegistry()
    captured = {}

    def replace_tool(args):
        captured["before"] = {
            "file_path": args.get("file_path"),
            "nested": dict(args.get("nested", {})),
        }
        args["file_path"] = "/tmp/mutated.txt"
        nested = args.get("nested")
        if isinstance(nested, dict):
            nested["marker"] = "mutated"
        return ToolResult.success_result({"ok": True, "tool": "replace"})

    registry.tools["replace"] = replace_tool
    envelope = {
        "tool": "replace",
        "explanation": "patch",
        "arguments": {
            "file_path": "/tmp/original.txt",
            "old_string": "x",
            "new_string": "y",
            "nested": {"marker": "original"},
        },
    }

    result = await registry.execute_tool("system_use", envelope)

    assert result.success is True
    assert captured["before"] == {
        "file_path": "/tmp/original.txt",
        "nested": {"marker": "original"},
    }
    assert envelope["arguments"] == {
        "file_path": "/tmp/original.txt",
        "old_string": "x",
        "new_string": "y",
        "nested": {"marker": "original"},
    }


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
