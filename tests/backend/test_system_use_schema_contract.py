from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.system.unified_schema import (
    get_unified_system_use_function_declaration,
)


def test_registry_emits_canonical_unified_system_use_schema():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declarations = registry.get_function_declarations_filtered(["system_use"])

    assert declarations == [get_unified_system_use_function_declaration()]


def test_registry_normalizes_legacy_system_tool_names_to_canonical_unified_schema():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declarations = registry.get_function_declarations_filtered(
        [
            "run_shell_command",
            "replace",
            "read_file",
            "get_system_stats",
            "get_open_windows",
        ],
    )

    assert declarations == [get_unified_system_use_function_declaration()]


def test_unified_system_use_schema_description_includes_supported_tools():
    declaration = get_unified_system_use_function_declaration()
    function = declaration["function"]
    description = function["description"]

    assert "`tool`" in description
    assert "`arguments`" in description
    assert "replace" in description
    assert "run_shell_command" in description
    assert "get_open_windows" in description


def test_unified_system_use_schema_requires_tool_and_constrains_arguments_variants():
    declaration = get_unified_system_use_function_declaration()
    parameters = declaration["function"]["parameters"]
    tool_enum = parameters["properties"]["tool"]["enum"]
    one_of_entries = parameters["properties"]["arguments"]["oneOf"]

    assert parameters["required"] == ["tool"]
    assert set(tool_enum) == {
        "run_shell_command",
        "replace",
        "read_file",
        "get_system_stats",
        "get_open_windows",
    }
    assert {
        entry["title"]
        for entry in one_of_entries
    } == {
        "run_shell_command arguments",
        "replace arguments",
        "read_file arguments",
        "get_system_stats arguments",
        "get_open_windows arguments",
    }
