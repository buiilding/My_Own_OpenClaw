"""
Remote browser-domain tool stubs.
"""

from __future__ import annotations

from typing import Any

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.browser.schemas import BrowserControlArgs
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult


class RemoteBrowserTool(RemoteToolBase, Tool[BrowserControlArgs]):
    name = "browser"
    description = (
        "Control the WindieOS browser instance for navigation, extraction, page "
        "interaction, tab management, and screenshots."
    )
    args_model = BrowserControlArgs
    category = ToolDomain.BROWSER

    async def execute_remote(self, args: BrowserControlArgs, ctx: ToolContext) -> Any:
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name=self.name,
            args=args.model_dump(exclude_defaults=True, exclude_none=True),
            request_id=request_id,
        )
