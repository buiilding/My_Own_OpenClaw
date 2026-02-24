from collections.abc import Iterable

from backend.src.core.config.models import AppConfig, SecurityLimits
from backend.src.llm.parser import ResponseParser
from backend.src.llm.parser_types import ToolCallSchema
from backend.src.tools.categorization import ToolDomain


class DummyTool:
    def __init__(
        self,
        name: str,
        category: ToolDomain = ToolDomain.FILESYSTEM,
        description: str | None = None,
    ) -> None:
        self.name = name
        self.category = category
        self.description = description or f"{name} tool"


class DummyRegistry:
    def __init__(self, tools: Iterable[DummyTool]) -> None:
        self._tools = {tool.name: tool for tool in tools}

    def get_tool_names(self):
        return list(self._tools.keys())

    def get_tool(self, name):
        return self._tools.get(name)


def make_response_parser(
    tools: list[DummyTool],
    *,
    limits: SecurityLimits | None = None,
    schema: ToolCallSchema | None = None,
) -> ResponseParser:
    config = AppConfig(
        interaction_mode="agent",
        security_limits=limits or SecurityLimits(),
    )
    return ResponseParser(
        config=config,
        tool_registry=DummyRegistry(tools),
        schema=schema,
    )
