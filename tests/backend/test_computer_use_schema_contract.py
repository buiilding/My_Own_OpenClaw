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
