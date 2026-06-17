"""
Remote browser-domain tool stubs.
"""

from __future__ import annotations

from typing import Any

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.browser.schemas import (
    BrowserControlArgs,
    build_browser_tool_parameters_schema,
)
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult
from backend.src.tools.tool_specs import build_function_tool_spec


class RemoteBrowserTool(RemoteToolBase, Tool[BrowserControlArgs]):
    name = "browser"
    description = (
        "Control the dedicated browser instance for navigation, extraction, page "
        "interaction, tab management, and screenshots."
    )
    args_model = BrowserControlArgs
    category = ToolDomain.BROWSER

    @classmethod
    def build_tool_spec(cls) -> dict[str, Any]:
        return build_function_tool_spec(
            name=cls.name,
            description=cls.description,
            parameters=build_browser_tool_parameters_schema(),
            strict=False,
        )

    async def execute_remote(self, args: BrowserControlArgs, ctx: ToolContext) -> Any:
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name=self.name,
            args=args.model_dump(exclude_defaults=True, exclude_none=True),
            request_id=request_id,
        )
