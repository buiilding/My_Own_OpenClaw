from backend.src.tools.registry import (
    _LEGACY_SYSTEM_TOOL_NAMES,
    _UNIFIED_SYSTEM_TOOL_NAME,
)
from backend.src.tools.remote_tools.system import (
    _SYSTEM_USE_MODEL_BY_TOOL,
    _SYSTEM_USE_TARGET_TOOL_BY_TOOL,
)
from backend.src.tools.system.unified_schema import (
    get_unified_system_use_function_declaration,
)


def test_unified_system_use_schema_tool_enum_matches_backend_remote_mapping():
    declaration = get_unified_system_use_function_declaration()
    enum_values = declaration["function"]["parameters"]["properties"]["tool"]["enum"]

    assert set(enum_values) == set(_SYSTEM_USE_MODEL_BY_TOOL.keys())


def test_backend_registry_legacy_system_names_match_remote_mapping_keys():
    assert _LEGACY_SYSTEM_TOOL_NAMES == set(_SYSTEM_USE_TARGET_TOOL_BY_TOOL.keys())


def test_unified_system_use_schema_has_canonical_tool_name():
    declaration = get_unified_system_use_function_declaration()
    assert declaration["function"]["name"] == _UNIFIED_SYSTEM_TOOL_NAME
