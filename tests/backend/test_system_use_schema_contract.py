from backend.src.core.config import AppConfig
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


def test_replace_schema_keeps_batch_and_patch_variants_directly():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declaration = registry.get_function_declarations_filtered(["replace"])[0]
    properties = declaration["parameters"]["properties"]

    assert declaration["name"] == "replace"
    assert "replacements" in properties
    assert "patch_chunks" in properties
    assert "explanation" in properties
