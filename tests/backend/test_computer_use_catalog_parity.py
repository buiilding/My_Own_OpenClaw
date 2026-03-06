from backend.src.tools.computer.unified_schema import (
    get_unified_computer_use_function_declaration,
)
from backend.src.tools.registry import (
    _LEGACY_COMPUTER_TOOL_NAMES,
    _UNIFIED_COMPUTER_TOOL_NAME,
)
from backend.src.tools.remote_tools.computer import _COMPUTER_USE_MODEL_BY_TOOL


def test_unified_schema_tool_enum_matches_backend_remote_computer_use_mapping():
    declaration = get_unified_computer_use_function_declaration()
    enum_values = declaration["function"]["parameters"]["properties"]["tool"]["enum"]

    assert set(enum_values) == set(_COMPUTER_USE_MODEL_BY_TOOL.keys())


def test_backend_registry_legacy_computer_names_match_remote_computer_use_mapping():
    assert _LEGACY_COMPUTER_TOOL_NAMES == set(_COMPUTER_USE_MODEL_BY_TOOL.keys())


def test_unified_schema_has_canonical_computer_use_tool_name():
    declaration = get_unified_computer_use_function_declaration()
    assert declaration["function"]["name"] == _UNIFIED_COMPUTER_TOOL_NAME
