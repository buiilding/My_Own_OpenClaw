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

Automatic `post_action_snapshot` attachment is temporarily disabled for testing.
Use explicit `browser_control(action="snapshot", ...)` calls when snapshot data is needed.

Actions:
- connect: Initialize browser (requires mode)
- status: Session status summary
- profiles: Lists WindieOS profile equivalents
- navigate: Go to URL (requires url)
- open: Open a new tab and navigate
- snapshot: Get contextual page snapshot with refs (waits for `wait_until=load` by default; supports mode=efficient, interactive/compact/depth/selector/frame)
- extract: Pull query-focused page content from DOM text (`query`, optional `start_from_char`, optional `extract_links`)
- click: Click element (requires ref from snapshot)
- type: Type text (requires ref, text)
- press: Press key like Enter/Escape (requires key)
- scroll: Scroll page (direction: up/down/left/right)
- screenshot: Capture screenshot (optional full_page)
- pdf: Capture page as PDF
- upload/dialog: File-input upload and dialog arming/wait handling
- act: OpenClaw action envelope (`request.kind`)
- errors/requests: Captured page errors and network request history
- trace_start/trace_stop: Playwright tracing control
- cookies*/storage*: Cookie and storage state management
- set_*: Environment/state setters (offline, headers, credentials, geolocation, media, timezone, locale, device)
- wait: Wait for load or time
- get_tabs: List open tabs
- switch_tab: Switch to tab (requires target_id)
- evaluate: Run JavaScript (requires script)
- close: Close browser connection"""
    args_model = BrowserControlArgs
    category = ToolDomain.BROWSER

    async def execute_remote(self, args: BrowserControlArgs, ctx: ToolContext) -> Any:
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name=self.name,
            args=args.model_dump(exclude_defaults=True, exclude_none=True),
            request_id=request_id,
        )
