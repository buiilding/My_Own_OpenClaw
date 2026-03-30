from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.tools.registry import ToolRegistry


_COMPUTER_TOOL_NAMES = [
    "mouse_control",
    "keyboard_control",
    "screenshot",
    "scroll_control",
    "switch_tab",
    "wait",
]


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
    assert parameters["properties"]["direction"]["enum"] == ["up", "down", "left", "right"]
