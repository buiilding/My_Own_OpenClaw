from typing import Optional

import pytest
from pydantic import BaseModel

from backend.src.core.config.models import AppConfig
from backend.src.core.infrastructure.cache import cache_manager
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
    assert schema["name"] == "dummy_tool"
    assert schema["description"] == "Dummy tool"
    assert "parameters" in schema
    assert "metadata" not in schema.get("parameters", {})


def test_tool_schema_computer_format_wrapped():
    tool = DummyComputerTool()
    schema = tool.get_json_schema()
    assert schema["name"] == "dummy_computer"
    params = schema["parameters"]
    assert "metadata" in params["properties"]
    assert "action" in params["properties"]
    action = params["properties"]["action"]["properties"]["functionCall"]["properties"]
    assert action["name"]["const"] == "dummy_computer"


def test_schema_registry_caches_schemas():
    cache_manager.tool_schemas.clear()

    class CountingTool(DummyTool):
        calls = 0

        def get_json_schema(self):
            CountingTool.calls += 1
            return super().get_json_schema()

    tool = CountingTool()
    registry = SchemaRegistry()
    schema1 = registry.get_schema(tool)
    schema2 = registry.get_schema(tool)

    assert schema1 == schema2
    assert CountingTool.calls == 1


def test_schema_registry_handles_schema_errors():
    cache_manager.tool_schemas.clear()

    class BrokenTool(DummyTool):
        def get_json_schema(self):
            raise RuntimeError("boom")

    registry = SchemaRegistry()
    schema = registry.get_schema(BrokenTool())
    assert schema is None


def test_tool_registry_declarations_and_capabilities():
    config = AppConfig()
    registry = ToolRegistry(config=config)
    registry.register_tool(DummyTool())

    declarations = registry.get_function_declarations_filtered(["dummy_tool"])
    assert len(declarations) == 1
    assert declarations[0]["name"] == "dummy_tool"

    capabilities = registry.get_tool_capabilities("dummy_tool")
    assert capabilities is not None
    assert capabilities["name"] == "dummy_tool"
