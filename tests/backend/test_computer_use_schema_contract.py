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


def test_unified_schema_function_description_is_concise_and_includes_contract_fields():
    declaration = get_unified_computer_use_function_declaration()
    function = declaration["function"]
    description = function["description"]

    assert "Unified computer-use tool for desktop interaction." in description
    assert "`description`, `explanation`, `expectation`" in description
    assert "`tool`" in description
    assert "`arguments`" in description


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
    assert mouse_schema["properties"]["action"]["enum"] == [
        "click",
        "double_click",
        "right_click",
        "move",
        "drag",
    ]
    assert "scroll_amount" not in mouse_schema["properties"]
    assert "scroll_direction" not in mouse_schema["properties"]
    assert "clicks" not in mouse_schema["properties"]

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
        and rule.get("then", {}).get("required") == ["source_description"]
        for rule in all_of_rules
    )
    assert any(
        rule.get("if", {}).get("properties", {}).get("drag_to_find_coordinates_by", {}).get("const") == "manual"
        and rule.get("then", {}).get("required") == ["drag_to_x", "drag_to_y"]
        for rule in all_of_rules
    )
    assert any(
        rule.get("if", {}).get("properties", {}).get("drag_to_find_coordinates_by", {}).get("const") == "ocr"
        and {"required": ["drag_to_ocr_text"]} in rule.get("then", {}).get("anyOf", [])
        and {"required": ["drag_to_candidate_id"]} in rule.get("then", {}).get("anyOf", [])
        for rule in all_of_rules
    )
    assert any(
        rule.get("if", {}).get("properties", {}).get("drag_to_find_coordinates_by", {}).get("const") == "prediction"
        and rule.get("then", {}).get("required") == ["destination_description"]
        for rule in all_of_rules
    )
    assert not any(
        rule.get("if", {}).get("properties", {}).get("action", {}).get("const") == "scroll"
        for rule in all_of_rules
    )


def test_unified_schema_scroll_arguments_lock_grounding_requirements():
    declaration = get_unified_computer_use_function_declaration()
    one_of_entries = declaration["function"]["parameters"]["properties"]["arguments"]["oneOf"]
    scroll_schema = next(
        entry
        for entry in one_of_entries
        if entry.get("title") == "scroll_control arguments"
    )

    assert scroll_schema["properties"]["action"]["enum"] == [
        "scroll",
        "scroll_up",
        "scroll_down",
    ]
    assert scroll_schema["properties"]["find_coordinates_by"]["enum"] == [
        "manual",
        "ocr",
        "prediction",
    ]
    assert "amount" not in scroll_schema["properties"]

    all_of_rules = scroll_schema["allOf"]
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
        and rule.get("then", {}).get("required") == ["source_description"]
        for rule in all_of_rules
    )
    assert any(
        rule.get("if", {}).get("properties", {}).get("action", {}).get("const") == "scroll"
        and rule.get("then", {}).get("required") == ["direction"]
        for rule in all_of_rules
    )
