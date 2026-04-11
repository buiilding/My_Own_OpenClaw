from __future__ import annotations
from pathlib import Path

from backend.src.core.config.models import AppConfig
from backend.src.tools.remote import RemoteMouseTool
from backend.src.tools.remote_tools.computer import (
    RemoteGroundedMouseTool,
    RemoteGroundedScrollTool,
    RemoteScrollTool,
)
from backend.src.tools.tool_policy import ToolPolicy
from backend.src.tools.tool_selection import load_tool_selection


def _load_selection(tmp_path: Path, text: str):
    path = tmp_path / "tool_selection.toml"
    path.write_text(text, encoding="utf-8")
    return load_tool_selection(path)


def test_filter_tool_names_applies_interaction_mode_allowlist():
    policy = ToolPolicy(config=AppConfig(interaction_mode="chat"), selection=None)

    filtered = policy.filter_tool_names(
        [
            "read_file",
            "replace",
            "run_shell_command",
            "open_app",
            "process",
            "screenshot",
            "browser",
        ]
    )

    assert filtered == [
        "read_file",
        "replace",
        "run_shell_command",
        "open_app",
        "process",
        "screenshot",
    ]


def test_filter_tool_names_applies_dev_selection(tmp_path: Path):
    selection = _load_selection(
        tmp_path,
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["read_file", "write_file"]\n'
        ),
    )
    policy = ToolPolicy(config=AppConfig(interaction_mode="agent"), selection=selection)

    filtered = policy.filter_tool_names(["read_file", "write_file", "glob"])

    assert filtered == ["read_file", "write_file"]


def test_filter_tool_names_keeps_direct_tool_names():
    policy = ToolPolicy(
        config=AppConfig(interaction_mode="agent", browser_automation_enabled=True),
        selection=None,
    )

    filtered = policy.filter_tool_names(
        ["read_file", "mouse_control", "keyboard_control", "browser"]
    )

    assert filtered == ["read_file", "mouse_control", "keyboard_control", "browser"]


def test_filter_tool_names_disables_browser_when_browser_automation_not_enabled():
    policy = ToolPolicy(
        config=AppConfig(interaction_mode="agent", browser_automation_enabled=False),
        selection=None,
    )

    filtered = policy.filter_tool_names(
        ["browser", "mouse_control", "read_file"]
    )

    assert filtered == ["mouse_control", "read_file"]


def test_filter_tool_names_hides_backend_web_search_for_openai_native_search():
    policy = ToolPolicy(
        config=AppConfig(
            interaction_mode="chat",
            model_provider="openai",
            selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
        ),
        selection=None,
    )

    filtered = policy.filter_tool_names(["browser", "web_search", "read_file"])

    assert filtered == ["read_file"]


def test_filter_tool_names_hides_web_search_without_native_or_brave_support():
    policy = ToolPolicy(
        config=AppConfig(
            interaction_mode="chat",
            model_provider="anthropic",
            selected_model_id="claude-sonnet-4-20250514",
        ),
        selection=None,
    )

    filtered = policy.filter_tool_names(["web_search", "read_file"])

    assert filtered == ["read_file"]


def test_filter_tool_schemas_filters_mouse_method_fields(tmp_path: Path):
    selection = _load_selection(
        tmp_path,
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual"]\n'
        ),
    )
    policy = ToolPolicy(config=AppConfig(interaction_mode="agent"), selection=selection)

    mouse_schema = RemoteMouseTool().get_json_schema()
    read_schema = {
        "type": "function",
        "name": "read_file",
        "parameters": {"type": "object"},
    }
    schemas = policy.filter_tool_schemas([mouse_schema, read_schema])

    assert len(schemas) == 1
    assert schemas[0]["name"] == "mouse_control"
    args_props = schemas[0]["parameters"]["properties"]
    assert args_props["find_coordinates_by"]["type"] == "string"
    assert args_props["find_coordinates_by"]["enum"] == ["manual"]
    assert "x" in args_props
    assert "y" in args_props
    assert "ocr_text" not in args_props
    assert "source_description" not in args_props
    assert "destination_description" not in args_props
    assert "model_name" not in args_props


def test_filter_tool_schemas_filters_scroll_and_grounded_method_fields(tmp_path: Path):
    selection = _load_selection(
        tmp_path,
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control", "scroll_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual", "ocr"]\n'
        ),
    )
    policy = ToolPolicy(config=AppConfig(interaction_mode="agent"), selection=selection)

    schemas = policy.filter_tool_schemas(
        [
            RemoteScrollTool().get_json_schema(),
            RemoteGroundedMouseTool().get_json_schema(),
            RemoteGroundedScrollTool().get_json_schema(),
        ]
    )

    assert [schema["name"] for schema in schemas] == [
        "scroll_control",
        "grounded_mouse_action",
        "grounded_scroll_action",
    ]

    scroll_props = schemas[0]["parameters"]["properties"]
    assert scroll_props["find_coordinates_by"]["enum"] == ["manual", "ocr"]
    assert "source_description" not in scroll_props
    assert "model_name" not in scroll_props

    grounded_mouse_props = schemas[1]["parameters"]["properties"]
    assert "source_description" not in grounded_mouse_props
    assert "destination_description" not in grounded_mouse_props
    assert "model_name" not in grounded_mouse_props
    assert "drag_to_model_name" not in grounded_mouse_props
    assert "ocr" in grounded_mouse_props["action"]["description"].lower()
    assert "non-text" not in grounded_mouse_props["action"]["description"].lower()

    grounded_scroll_props = schemas[2]["parameters"]["properties"]
    assert "source_description" not in grounded_scroll_props
    assert "model_name" not in grounded_scroll_props
    assert "non-text" not in grounded_scroll_props["action"]["description"].lower()


def test_filter_tool_schemas_removes_prediction_drag_rules_when_prediction_disabled(tmp_path: Path):
    selection = _load_selection(
        tmp_path,
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual", "ocr"]\n'
        ),
    )
    policy = ToolPolicy(config=AppConfig(interaction_mode="agent"), selection=selection)

    mouse_schema = policy.filter_tool_schemas([RemoteMouseTool().get_json_schema()])[0]
    props = mouse_schema["parameters"]["properties"]
    assert props["drag_to_find_coordinates_by"]["enum"] == ["manual", "ocr"]
    assert "destination_description" not in props
    assert "drag_to_model_name" not in props

    rule_methods = []
    for rule in mouse_schema["parameters"].get("allOf", []):
        if_block = rule.get("if", {})
        properties = if_block.get("properties", {})
        method_schema = properties.get("find_coordinates_by") or properties.get(
            "drag_to_find_coordinates_by"
        )
        if isinstance(method_schema, dict) and isinstance(method_schema.get("const"), str):
            rule_methods.append(method_schema["const"])

    assert "prediction" not in rule_methods


def test_filter_tool_schemas_disables_browser_when_browser_automation_not_enabled():
    policy = ToolPolicy(
        config=AppConfig(interaction_mode="agent", browser_automation_enabled=False),
        selection=None,
    )

    browser_schema = {
        "type": "function",
        "name": "browser",
        "parameters": {"type": "object"},
    }
    system_schema = {
        "type": "function",
        "name": "read_file",
        "parameters": {"type": "object"},
    }

    filtered = policy.filter_tool_schemas([browser_schema, system_schema])

    assert [schema["name"] for schema in filtered] == ["read_file"]


def test_filter_tool_schemas_hides_backend_web_search_for_openai_native_search():
    policy = ToolPolicy(
        config=AppConfig(
            interaction_mode="chat",
            model_provider="openai",
            selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
        ),
        selection=None,
    )

    web_search_schema = {
        "type": "function",
        "name": "web_search",
        "parameters": {"type": "object"},
    }
    read_schema = {
        "type": "function",
        "name": "read_file",
        "parameters": {"type": "object"},
    }

    filtered = policy.filter_tool_schemas([web_search_schema, read_schema])

    assert [schema["name"] for schema in filtered] == ["read_file"]


def test_get_method_validation_errors_rejects_disabled_mouse_method(tmp_path: Path):
    selection = _load_selection(
        tmp_path,
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual", "ocr"]\n'
        ),
    )
    policy = ToolPolicy(config=AppConfig(interaction_mode="agent"), selection=selection)

    errors = policy.get_method_validation_errors(
        "mouse_control",
        {"action": "click", "find_coordinates_by": "prediction"},
    )

    assert len(errors) == 1
    assert "find_coordinates_by='prediction'" in errors[0]


def test_should_initialize_startup_services_follow_mouse_methods(tmp_path: Path):
    selection = _load_selection(
        tmp_path,
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual"]\n'
        ),
    )
    policy = ToolPolicy(config=AppConfig(interaction_mode="agent"), selection=selection)

    assert policy.should_initialize_ocr() is False
    assert policy.should_initialize_vision() is False
