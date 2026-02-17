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
- search/go_back: Browser Use search helper and back navigation helper
- done: Browser Use completion action (`text`, optional `success`, optional `files_to_display`)
- snapshot: Get contextual page snapshot with refs (waits for `wait_until=load` by default; supports mode=efficient, interactive/compact/depth/selector/frame)
- extract: Pull page content via `mode` (`focused`/`full_text`/`structured`) with optional `selector`/`frame` scoping, `start_from_char`, and `extract_links`
- search_page/find_elements/find_text: Browser Use discovery helpers for text pattern and selector discovery
- click: Click element (supports ref/index or coordinate_x+coordinate_y)
- type: Type text (requires ref, text)
- input/send_keys: Browser Use input and key-sequence aliases
- switch/close_tab: Browser Use tab switch/close helpers (uses `tab_id` or `target_id` suffix)
- dropdown_options/select_dropdown: Browser Use dropdown inspection and selection helpers
- upload_file: Browser Use upload helper (`index` + `path`)
- write_file/replace_file/read_file/read_long_content: Browser Use file-system tools
- press: Press key like Enter/Escape (requires key)
- scroll: Scroll page (direction: up/down/left/right, Browser Use `pages` supports fractional values)
- screenshot: Capture screenshot (optional full_page)
- pdf: Capture page as PDF
- upload/dialog: File-input upload and dialog arming/wait handling
- act: OpenClaw action envelope (`request.kind`)
- errors/requests: Captured page errors and network request history
- trace_start/trace_stop: Deprecated (returns ACTION_DEPRECATED with Browser Use migration guidance)
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
