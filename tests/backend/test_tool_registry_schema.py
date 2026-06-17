"""Covers tool registry schema behavior in the backend test suite."""

import logging
from typing import Optional

import pytest
from pydantic import BaseModel

from backend.src.core.config.models import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.computer.schemas import MouseControlArgs
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.schema_registry import SchemaRegistry
from backend.src.tools.tool_catalog import (
    get_built_tool_catalog,
    get_model_visible_tool_names,
)


class DummyArgs(BaseModel):
    path: str
    optional: Optional[int] = None


class DummyTool(Tool[DummyArgs]):
    name = "dummy_tool"
    description = "Dummy tool"
    args_model = DummyArgs
    category = ToolDomain.FILESYSTEM

    async def run(self, args: DummyArgs, ctx):  # pragma: no cover - not used in tests
        return args.path


class DummyComputerTool(DummyTool):
    name = "dummy_computer"
    category = ToolDomain.COMPUTER


class NestedMapValueArgs(BaseModel):
    label: str
    count: int


class TypedMapArgs(BaseModel):
    counts: dict[str, int]
    nested: dict[str, NestedMapValueArgs]


class TypedMapTool(Tool[TypedMapArgs]):
    name = "typed_map_tool"
    description = "Typed map tool"
    args_model = TypedMapArgs
    category = ToolDomain.OTHER

    async def run(
        self, args: TypedMapArgs, ctx
    ):  # pragma: no cover - not used in tests
        return args.model_dump()


def test_tool_schema_standard_format():
    tool = DummyTool()
    schema = tool.get_json_schema()
    assert schema["type"] == "function"
    assert schema["name"] == "dummy_tool"
    assert schema["description"] == "Dummy tool"
    assert "parameters" in schema
    assert "metadata" not in schema.get("parameters", {})


def test_tool_schema_computer_format_native():
    tool = DummyComputerTool()
    schema = tool.get_json_schema()
    assert schema["type"] == "function"
    assert schema["name"] == "dummy_computer"
    params = schema["parameters"]
    assert "metadata" not in params.get("properties", {})
    assert "action" not in params.get("properties", {})
    assert params["properties"]["path"]["type"] == "string"
    assert "path" in params.get("required", [])


def test_tool_schema_preserves_typed_map_value_schemas():
    schema = TypedMapTool.build_tool_spec()
    properties = schema["parameters"]["properties"]

    assert properties["counts"]["additionalProperties"]["type"] == "integer"
    nested_value_schema = properties["nested"]["additionalProperties"]
    assert nested_value_schema["type"] == "object"
    assert nested_value_schema["properties"]["label"]["type"] == "string"
    assert nested_value_schema["properties"]["count"]["type"] == "integer"
    assert nested_value_schema["required"] == ["label", "count"]


def test_tool_schema_preserves_top_level_extra_forbid_boundary():
    schema = MouseControlArgs.model_json_schema()
    assert schema["additionalProperties"] is False

    tool_schema = ToolRegistry(
        config=AppConfig(), cache_manager=CacheManager()
    ).get_function_declarations_filtered(["mouse_control"])[0]

    assert tool_schema["parameters"]["additionalProperties"] is False


def test_schema_registry_caches_schemas():
    cache_manager = CacheManager()
    registry = SchemaRegistry(cache_manager=cache_manager)
    schema = DummyTool.build_tool_spec()
    schema1 = registry.get_schema("dummy_tool", schema)
    schema2 = registry.get_schema("dummy_tool", schema)

    assert schema1 == schema2


def test_schema_registry_handles_schema_errors():
    cache_manager = CacheManager()
    registry = SchemaRegistry(cache_manager=cache_manager)
    schema = registry.get_schema("broken_tool", {"invalid": True})
    assert schema is None


def test_catalog_build_entry_contains_prebuilt_canonical_spec():
    built_entry = next(
        entry for entry in get_built_tool_catalog() if entry.entry.name == "browser"
    )

    assert built_entry.entry.name == "browser"
    assert built_entry.tool_class.__name__ == "RemoteBrowserTool"
    assert built_entry.tool_spec["type"] == "function"
    assert built_entry.tool_spec["name"] == "browser"


def test_tool_registry_declarations_and_capabilities():
    config = AppConfig()
    cache_manager = CacheManager()
    registry = ToolRegistry(config=config, cache_manager=cache_manager)
    registry.register_tool(DummyTool())

    declarations = registry.get_function_declarations_filtered(["dummy_tool"])
    assert len(declarations) == 1
    assert declarations[0]["name"] == "dummy_tool"

    capabilities = registry.get_tool_capabilities("dummy_tool")
    assert capabilities is not None
    assert capabilities["name"] == "dummy_tool"


def test_tool_registry_startup_does_not_duplicate_catalog_tools(caplog):
    config = AppConfig()

    with caplog.at_level(logging.WARNING, logger="backend.src.tools.registry"):
        registry = ToolRegistry(config=config, cache_manager=CacheManager())

    assert registry.get_tool("grounded_mouse_action") is not None
    assert registry.get_tool("grounded_scroll_action") is not None
    assert "already registered. Overwriting." not in caplog.text


def test_tool_registry_register_overwrites_existing_tool():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    first = DummyTool()
    registry.register_tool(first)
    assert registry.get_tool("dummy_tool") is first

    class ReplacementTool(DummyTool):
        description = "Replacement"

    replacement = ReplacementTool()
    registry.register_tool(replacement)

    assert registry.get_tool("dummy_tool") is replacement
    assert registry.get_tool("dummy_tool").description == "Replacement"
    assert registry.tool_specs["dummy_tool"]["description"] == "Replacement"


def test_tool_registry_builds_schema_once_at_registration_time():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    class CountingTool(DummyTool):
        calls = 0

        @classmethod
        def build_tool_spec(cls):
            cls.calls += 1
            return super().build_tool_spec()

    registry.register_tool(CountingTool())

    assert CountingTool.calls == 1

    declarations_first = registry.get_function_declarations_filtered(["dummy_tool"])
    declarations_second = registry.get_function_declarations_filtered(["dummy_tool"])

    assert CountingTool.calls == 1
    assert declarations_first == declarations_second


def test_tool_registry_get_tool_names_is_sorted():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    class ToolB(DummyTool):
        name = "z_tool"

    class ToolA(DummyTool):
        name = "a_tool"

    registry.register_tool(ToolB())
    registry.register_tool(ToolA())

    names = registry.get_tool_names()
    assert names == sorted(names)


def test_tool_registry_filtered_declarations_include_only_requested_tool():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    class OtherDummyTool(DummyTool):
        name = "other_dummy_tool"

    registry.register_tool(DummyTool())
    registry.register_tool(OtherDummyTool())

    declarations = registry.get_function_declarations_filtered(["dummy_tool"])

    assert [d["name"] for d in declarations] == ["dummy_tool"]


def test_tool_registry_filtered_declarations_include_requested_computer_tools():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    declarations = registry.get_function_declarations_filtered(
        ["mouse_control", "keyboard_control", "screenshot", "switch_window", "wait"]
    )
    names = [d["name"] for d in declarations]

    assert names == [
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "switch_window",
        "wait",
    ]


def test_tool_registry_filtered_declarations_include_requested_system_tools():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    declarations = registry.get_function_declarations_filtered(
        [
            "run_shell_command",
            "replace",
            "read_file",
            "get_system_stats",
            "get_open_windows",
        ]
    )
    names = [d["name"] for d in declarations]

    assert names == [
        "run_shell_command",
        "replace",
        "read_file",
        "get_system_stats",
        "get_open_windows",
    ]


def test_tool_registry_declarations_follow_model_visible_catalog_order():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    declarations = registry.get_function_declarations()

    expected_names = get_model_visible_tool_names() + ["web_search"]
    assert [d["name"] for d in declarations] == expected_names


def test_tool_registry_filtered_declarations_preserve_requested_order():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    declarations = registry.get_function_declarations_filtered(
        ["replace", "browser", "read_file", "replace"]
    )

    assert [d["name"] for d in declarations] == ["replace", "browser", "read_file"]


def test_tool_registry_mouse_declaration_exposes_direct_action_schema():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    declarations = registry.get_function_declarations_filtered(["mouse_control"])
    assert len(declarations) == 1

    parameters = declarations[0]["parameters"]
    assert parameters["properties"]["action"]["type"] == "string"
    assert parameters["properties"]["explanation"]["type"] == "string"
    assert parameters["properties"]["find_coordinates_by"]["type"] == "string"
    assert parameters["required"] == ["action", "explanation"]
    assert "metadata" not in parameters["properties"]


def test_tool_registry_browser_declaration_requires_explanation():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    declarations = registry.get_function_declarations_filtered(["browser"])
    assert len(declarations) == 1

    parameters = declarations[0]["parameters"]
    assert parameters["required"] == ["action", "explanation"]
    assert parameters["properties"]["explanation"]["type"] == "string"


def test_tool_registry_run_shell_declaration_is_direct_and_requires_explanation():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    declarations = registry.get_function_declarations_filtered(["run_shell_command"])
    assert len(declarations) == 1

    parameters = declarations[0]["parameters"]
    explanation = parameters["properties"]["explanation"]

    assert parameters["required"] == ["command", "run_in_background", "explanation"]
    assert explanation["type"] == "string"
    assert "tool" not in parameters["properties"]
    assert "arguments" not in parameters["properties"]


def test_tool_registry_availability_and_capabilities_fallback():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())

    assert registry.is_tool_available("dummy_tool") is False
    assert registry.get_tool_capabilities("dummy_tool") is None

    tool = DummyTool()
    registry.register_tool(tool)
    assert registry.is_tool_available("dummy_tool") is True

    original_get_schema = registry.schema_registry.get_schema
    registry.schema_registry.get_schema = lambda _tool_name, _schema: None
    try:
        assert registry.get_tool_capabilities("dummy_tool") is None
    finally:
        registry.schema_registry.get_schema = original_get_schema


def test_tool_registry_capabilities_handles_non_dict_function_schema():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    registry.register_tool(DummyTool())

    original_get_schema = registry.schema_registry.get_schema
    registry.schema_registry.get_schema = lambda _tool_name, _schema: {
        "function": "invalid"
    }
    try:
        capabilities = registry.get_tool_capabilities("dummy_tool")
    finally:
        registry.schema_registry.get_schema = original_get_schema

    assert capabilities is not None
    assert capabilities["name"] == "dummy_tool"
    assert capabilities["parameters"] == {}
    assert capabilities["requires_context"] is True
