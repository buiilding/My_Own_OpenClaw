from typing import Optional

import pytest
from pydantic import BaseModel

from backend.src.core.config.models import AppConfig
from backend.src.core.infrastructure.cache import CacheManager
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.schema_registry import SchemaRegistry


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


def test_tool_schema_standard_format():
    tool = DummyTool()
    schema = tool.get_json_schema()
    assert schema["type"] == "function"
    function_schema = schema["function"]
    assert function_schema["name"] == "dummy_tool"
    assert function_schema["description"] == "Dummy tool"
    assert "parameters" in function_schema
    assert "metadata" not in function_schema.get("parameters", {})


def test_tool_schema_computer_format_native():
    tool = DummyComputerTool()
    schema = tool.get_json_schema()
    assert schema["type"] == "function"
    function_schema = schema["function"]
    assert function_schema["name"] == "dummy_computer"
    params = function_schema["parameters"]
    assert "metadata" not in params.get("properties", {})
    assert "action" not in params.get("properties", {})
    assert params["properties"]["path"]["type"] == "string"
    assert "path" in params.get("required", [])


def test_schema_registry_caches_schemas():
    cache_manager = CacheManager()

    class CountingTool(DummyTool):
        calls = 0

        def get_json_schema(self):
            CountingTool.calls += 1
            return super().get_json_schema()

    tool = CountingTool()
    registry = SchemaRegistry(cache_manager=cache_manager)
    schema1 = registry.get_schema(tool)
    schema2 = registry.get_schema(tool)

    assert schema1 == schema2
    assert CountingTool.calls == 1


def test_schema_registry_handles_schema_errors():
    cache_manager = CacheManager()

    class BrokenTool(DummyTool):
        def get_json_schema(self):
            raise RuntimeError("boom")

    registry = SchemaRegistry(cache_manager=cache_manager)
    schema = registry.get_schema(BrokenTool())
    assert schema is None


def test_tool_registry_declarations_and_capabilities():
    config = AppConfig()
    cache_manager = CacheManager()
    registry = ToolRegistry(config=config, cache_manager=cache_manager)
    registry.register_tool(DummyTool())

    declarations = registry.get_function_declarations_filtered(["dummy_tool"])
    assert len(declarations) == 1
    assert declarations[0]["function"]["name"] == "dummy_tool"

    capabilities = registry.get_tool_capabilities("dummy_tool")
    assert capabilities is not None
    assert capabilities["name"] == "dummy_tool"
