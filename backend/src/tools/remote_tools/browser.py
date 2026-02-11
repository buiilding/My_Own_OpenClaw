"""
Remote browser-domain tool stubs.
"""

from __future__ import annotations

from typing import Any

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.browser.schemas import BrowserControlArgs
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.remote_tools.base import RemoteToolBase


class RemoteBrowserTool(RemoteToolBase, Tool[BrowserControlArgs]):
    name = "browser_control"
    description = """Control a web browser for online tasks.

Two modes available:
- 'user_chrome': Connect to your existing Chrome (must start with --remote-debugging-port=9222)
- 'managed': Launch isolated Chromium instance (clean profile, no logins)

Workflow:
1. Connect: browser_control(action="connect", mode="user_chrome")
2. Navigate: browser_control(action="navigate", url="https://example.com")
3. Snapshot: browser_control(action="snapshot") - shows page with numbered refs like [1] button
4. Interact: browser_control(action="click", ref="1") or browser_control(action="type", ref="2", text="hello")
5. Close: browser_control(action="close")

Actions:
- connect: Initialize browser (requires mode)
- navigate: Go to URL (requires url)
- snapshot: Get page overview with element refs
- click: Click element (requires ref from snapshot)
- type: Type text (requires ref, text)
- press: Press key like Enter/Escape (requires key)
- scroll: Scroll page (direction: up/down/left/right)
- screenshot: Capture screenshot (optional full_page)
- wait: Wait for load or time
- get_tabs: List open tabs
- switch_tab: Switch to tab (requires target_id)
- evaluate: Run JavaScript (requires script)
- close: Close browser connection"""
    args_model = BrowserControlArgs
    category = ToolDomain.BROWSER

    async def execute_remote(self, args: BrowserControlArgs, ctx: ToolContext) -> Any:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote browser tool call: {args.action}",
        )
