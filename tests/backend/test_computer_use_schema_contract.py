"""Covers computer use schema contract behavior in the backend test suite."""

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.tools.computer.schemas import MouseControlArgs, ScrollControlArgs
from backend.src.tools.provider_projection import project_tool_schemas_for_provider
from backend.src.tools.registry import ToolRegistry

_COMPUTER_TOOL_NAMES = [
    "mouse_control",
    "keyboard_control",
    "screenshot",
    "scroll_control",
    "switch_window",
    "wait",
]
_EXPLANATION = "test"


def _tool_parameters(tool_name: str) -> dict:
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    return registry.get_function_declarations_filtered([tool_name])[0]["parameters"]


def _schema_errors(tool_name: str, payload: dict) -> list[str]:
    validator = Draft202012Validator(_tool_parameters(tool_name))
    return [error.message for error in validator.iter_errors(payload)]


def test_registry_emits_direct_computer_tool_schemas():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())

    declarations = registry.get_function_declarations_filtered(_COMPUTER_TOOL_NAMES)

    assert [declaration["name"] for declaration in declarations] == _COMPUTER_TOOL_NAMES


def test_mouse_control_schema_is_direct_and_constrained():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declaration = registry.get_function_declarations_filtered(["mouse_control"])[0]
    parameters = declaration["parameters"]

    assert declaration["name"] == "mouse_control"
    assert parameters["properties"]["action"]["enum"] == [
        "click",
        "double_click",
        "right_click",
        "move",
        "drag",
    ]
    assert parameters["properties"]["find_coordinates_by"]["enum"] == [
        "manual",
        "ocr",
        "prediction",
    ]
    assert "metadata" not in parameters["properties"]


@pytest.mark.parametrize(
    ("payload", "model"),
    [
        ({"action": "click", "explanation": _EXPLANATION}, MouseControlArgs),
        ({"action": "scroll_down", "explanation": _EXPLANATION}, ScrollControlArgs),
    ],
)
def test_default_manual_source_grounding_is_required_in_schema_and_runtime(
    payload,
    model,
):
    with pytest.raises(ValidationError):
        model.model_validate(payload)

    tool_name = "scroll_control" if model is ScrollControlArgs else "mouse_control"
    errors = _schema_errors(tool_name, payload)

    assert errors
    assert any("'x' is a required property" in error for error in errors)
    assert any("'y' is a required property" in error for error in errors)


def test_default_manual_drag_destination_is_required_in_schema_and_runtime():
    payload = {
        "action": "drag",
        "x": 10,
        "y": 20,
        "explanation": _EXPLANATION,
    }

    with pytest.raises(ValidationError):
        MouseControlArgs.model_validate(payload)

    errors = _schema_errors("mouse_control", payload)

    assert errors
    assert any("'drag_to_x' is a required property" in error for error in errors)
    assert any("'drag_to_y' is a required property" in error for error in errors)


def test_omitted_manual_grounding_modes_pass_schema_and_runtime_with_coordinates():
    payload = {
        "action": "drag",
        "x": 10,
        "y": 20,
        "drag_to_x": 30,
        "drag_to_y": 40,
        "explanation": _EXPLANATION,
    }

    assert MouseControlArgs.model_validate(payload).find_coordinates_by == "manual"
    assert _schema_errors("mouse_control", payload) == []


def test_scroll_control_schema_stays_direct_and_requires_direction_for_scroll():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    declaration = registry.get_function_declarations_filtered(["scroll_control"])[0]
    parameters = declaration["parameters"]

    assert declaration["name"] == "scroll_control"
    assert parameters["properties"]["action"]["enum"] == [
        "scroll",
        "scroll_up",
        "scroll_down",
    ]
    assert parameters["properties"]["direction"]["enum"] == [
        "up",
        "down",
        "left",
        "right",
    ]


def test_provider_projection_is_noop_for_openai_computer_tools():
    config = AppConfig(model_provider="openai")
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    direct_schemas = registry.get_function_declarations_filtered(
        _COMPUTER_TOOL_NAMES + ["get_open_windows"]
    )

    projected = project_tool_schemas_for_provider(
        tool_schemas=direct_schemas,
        config=config,
    )

    assert [schema.get("name") for schema in projected] == _COMPUTER_TOOL_NAMES + [
        "get_open_windows"
    ]


def test_provider_projection_applies_config_disabled_tools():
    config = AppConfig(
        model_provider="openai",
        agent_disabled_tools=["get_open_windows"],
    )
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    direct_schemas = registry.get_function_declarations_filtered(
        _COMPUTER_TOOL_NAMES + ["get_open_windows"]
    )

    projected = project_tool_schemas_for_provider(
        tool_schemas=direct_schemas,
        config=config,
    )

    assert "get_open_windows" not in [schema.get("name") for schema in projected]


def test_provider_projection_applies_available_tools_allowlist():
    config = AppConfig(
        model_provider="openai",
        agent_available_tools=["mouse_control"],
    )
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    direct_schemas = registry.get_function_declarations_filtered(
        _COMPUTER_TOOL_NAMES + ["get_open_windows"]
    )

    projected = project_tool_schemas_for_provider(
        tool_schemas=direct_schemas,
        config=config,
    )

    assert [schema.get("name") for schema in projected] == ["mouse_control"]
