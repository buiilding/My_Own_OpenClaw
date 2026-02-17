from __future__ import annotations
from pathlib import Path

from backend.src.core.config.models import AppConfig
from backend.src.tools.remote import RemoteMouseTool
from backend.src.tools.tool_policy import ToolPolicy
from backend.src.tools.tool_selection import load_tool_selection


def _load_selection(tmp_path: Path, text: str):
    path = tmp_path / "tool_selection.toml"
    path.write_text(text, encoding="utf-8")
    return load_tool_selection(path)


def test_filter_tool_names_applies_interaction_mode_allowlist():
    policy = ToolPolicy(config=AppConfig(interaction_mode="chat"), selection=None)

    filtered = policy.filter_tool_names(
        ["read_file", "replace", "run_shell_command", "process", "screenshot", "browser"]
    )

    assert filtered == ["read_file", "replace", "run_shell_command", "process", "screenshot"]


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
        "function": {
            "name": "read_file",
            "parameters": {"type": "object"},
        },
    }
    schemas = policy.filter_tool_schemas([mouse_schema, read_schema])

    assert len(schemas) == 1
    assert schemas[0]["function"]["name"] == "mouse_control"
    args_props = schemas[0]["function"]["parameters"]["properties"]
    assert args_props["find_coordinates_by"]["enum"] == ["manual"]
    assert "x" in args_props
    assert "y" in args_props
    assert "ocr_text" not in args_props
    assert "description" not in args_props
    assert "model_name" not in args_props


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
