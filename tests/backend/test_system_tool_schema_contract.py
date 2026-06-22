"""Covers system tool schema contract behavior in the backend test suite."""

from backend.src.core.config.models import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.tools.registry import ToolRegistry

_SYSTEM_TOOL_NAMES = [
    "get_open_windows",
    "get_system_stats",
    "open_app",
    "run_shell_command",
    "process",
    "read_file",
    "replace",
]


def test_registry_emits_direct_system_tool_schemas():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())

    declarations = registry.get_function_declarations_filtered(_SYSTEM_TOOL_NAMES)

    assert [declaration["name"] for declaration in declarations] == _SYSTEM_TOOL_NAMES


def test_run_shell_command_schema_is_direct_and_requires_explanation():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declaration = registry.get_function_declarations_filtered(["run_shell_command"])[0]
    parameters = declaration["parameters"]

    assert declaration["name"] == "run_shell_command"
    assert parameters["required"] == ["command", "run_in_background", "explanation"]
    assert "tool" not in parameters["properties"]
    assert "arguments" not in parameters["properties"]
    assert "max_output_tokens" not in parameters["properties"]
    assert (
        "prefer fast targeted commands such as rg"
        in parameters["properties"]["command"]["description"]
    )
    assert (
        "generated dependency, build-artifact, packaged-runtime, and VCS directories"
        in parameters["properties"]["command"]["description"]
    )
    assert "frontend/release" not in parameters["properties"]["command"]["description"]
    assert (
        "frontend/python-runtime"
        not in parameters["properties"]["command"]["description"]
    )
    assert (
        "relative paths resolve from the user-selected workspace folder"
        in parameters["properties"]["directory"]["description"]
    )


def test_filesystem_tool_schemas_describe_workspace_relative_paths():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declarations = registry.get_function_declarations_filtered(["read_file", "replace"])
    declarations_by_name = {
        declaration["name"]: declaration for declaration in declarations
    }

    assert "relative paths resolve from the selected workspace folder" in (
        declarations_by_name["read_file"]["parameters"]["properties"]["file_path"][
            "description"
        ]
    )
    assert "relative paths resolve from the selected workspace folder" in (
        declarations_by_name["replace"]["parameters"]["properties"]["file_path"][
            "description"
        ]
    )


def test_replace_schema_keeps_batch_and_patch_variants_directly():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declaration = registry.get_function_declarations_filtered(["replace"])[0]
    properties = declaration["parameters"]["properties"]

    assert declaration["name"] == "replace"
    assert "replacements" in properties
    assert "patch_chunks" in properties
    assert "explanation" in properties
