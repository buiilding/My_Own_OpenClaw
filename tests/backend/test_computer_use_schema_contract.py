from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.tools.computer.unified_schema import (
    get_unified_computer_use_function_declaration,
)
from backend.src.tools.registry import ToolRegistry


def test_registry_emits_canonical_unified_computer_use_schema():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declarations = registry.get_function_declarations_filtered(["computer_use"])

    assert declarations == [get_unified_computer_use_function_declaration()]


def test_registry_normalizes_legacy_computer_tool_names_to_canonical_unified_schema():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declarations = registry.get_function_declarations_filtered(
        ["mouse_control", "keyboard_control", "screenshot", "scroll_control", "switch_tab", "wait"],
    )

    assert declarations == [get_unified_computer_use_function_declaration()]


def test_unified_schema_function_description_includes_metadata_and_grounding_guidance():
    declaration = get_unified_computer_use_function_declaration()
    function = declaration["function"]
    description = function["description"]

    assert "`description`, `explanation`, `expectation`" in description
    assert "find_coordinates_by='ocr'" in description
    assert "find_coordinates_by='prediction'" in description
    assert "candidate_id" in description
    assert "latest screenshot" in description
    assert "visible cursor position as a spatial reference" in description
    assert "post-action screenshot" in description


def test_unified_schema_requires_metadata_with_required_fields():
    declaration = get_unified_computer_use_function_declaration()
    parameters = declaration["function"]["parameters"]
    metadata = parameters["properties"]["metadata"]

    assert parameters["additionalProperties"] is False
    assert parameters["required"] == ["tool", "metadata"]
    assert metadata["additionalProperties"] is False
    assert metadata["required"] == ["description", "explanation", "expectation"]
    assert metadata["properties"]["description"]["minLength"] == 1
    assert metadata["properties"]["explanation"]["minLength"] == 1
    assert metadata["properties"]["expectation"]["minLength"] == 1


def test_unified_schema_mouse_arguments_lock_ocr_prediction_and_manual_requirements():
    declaration = get_unified_computer_use_function_declaration()
    one_of_entries = declaration["function"]["parameters"]["properties"]["arguments"]["oneOf"]
    mouse_schema = next(
        entry
        for entry in one_of_entries
        if entry.get("title") == "mouse_control arguments"
    )

    find_coordinates_by = mouse_schema["properties"]["find_coordinates_by"]
    assert find_coordinates_by["enum"] == ["manual", "ocr", "prediction"]

    all_of_rules = mouse_schema["allOf"]
    assert any(
        rule.get("if", {}).get("properties", {}).get("find_coordinates_by", {}).get("const") == "manual"
        and rule.get("then", {}).get("required") == ["x", "y"]
        for rule in all_of_rules
    )
    assert any(
        rule.get("if", {}).get("properties", {}).get("find_coordinates_by", {}).get("const") == "ocr"
        and {"required": ["ocr_text"]} in rule.get("then", {}).get("anyOf", [])
        and {"required": ["candidate_id"]} in rule.get("then", {}).get("anyOf", [])
        for rule in all_of_rules
    )
    assert any(
        rule.get("if", {}).get("properties", {}).get("find_coordinates_by", {}).get("const") == "prediction"
        and rule.get("then", {}).get("required") == ["description"]
        for rule in all_of_rules
    )
    assert any(
        rule.get("if", {}).get("properties", {}).get("action", {}).get("const") == "drag"
        and rule.get("then", {}).get("required") == ["drag_to_x", "drag_to_y"]
        for rule in all_of_rules
    )
