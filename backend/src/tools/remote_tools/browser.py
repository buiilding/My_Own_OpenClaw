"""
Remote browser-domain tool stubs.
"""

from __future__ import annotations

import os
from typing import Any

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.browser.schemas import BrowserControlArgs
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult


class RemoteBrowserTool(RemoteToolBase, Tool[BrowserControlArgs]):
    name = "browser"
    description = """Control a web browser for online tasks.

Connection model:
- WindieOS always uses a dedicated browser instance/profile (persistent credentials, isolated from the user's default browser profile).
- `connect` auto-attaches to that WindieOS instance if running, or launches it if not.

Workflow:
1. Connect: browser(action="connect")
2. Navigate: browser(action="navigate", url="https://example.com")
3. Snapshot: browser(action="snapshot") - shows page with numbered refs like [1] button
4. Interact (canonical): browser(action="click", ref="1"), browser(action="input", index=2, text="hello"), browser(action="send_keys", keys="Enter")
5. Close: browser(action="close")

Automatic `post_action_snapshot` attachment is temporarily disabled for testing.
Use explicit `browser(action="snapshot", ...)` calls when snapshot data is needed.

Actions:
- canonical: connect, status, profiles, navigate, snapshot, extract, click, input, send_keys, scroll, screenshot, wait, get_tabs, switch, evaluate, close
- canonical helpers: done, search, go_back, search_page, find_elements, find_text, close_tab, dropdown_options, select_dropdown, upload_file, write_file, replace_file, read_file, read_long_content
- compatibility aliases (legacy, deprecated): open->navigate(new_tab=true), type->input, press->send_keys, switch_tab->switch, act->direct action invocation

Compatibility validation notes:
- snapshot rejects compatibility fields `format`/`snapshotFormat`/`wait_until`/`state`/`mode`/`max_chars`/`refs`/`interactive`/`compact`/`depth`/`selector`/`frame`
- extract rejects compatibility fields `mode`/`selector`/`frame`
- screenshot rejects compatibility fields `full_page`/`ref`/`element`/`type`/`quality`
- set `WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1` to reject legacy alias actions at runtime
- set `WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=0` to disable legacy alias actions at runtime (rollout flag)"""
    args_model = BrowserControlArgs
    category = ToolDomain.BROWSER
    strict_canonical_actions_env = "WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY"
    allow_legacy_actions_env = "WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS"

    @classmethod
    def _strict_canonical_actions_enabled(cls) -> bool:
        raw = os.getenv(cls.strict_canonical_actions_env, "").strip().lower()
        return raw in {"1", "true", "yes", "on"}

    @classmethod
    def _legacy_actions_allowed(cls) -> bool:
        raw = os.getenv(cls.allow_legacy_actions_env, "").strip().lower()
        if raw == "":
            return True
        return raw not in {"0", "false", "no", "off"}

    async def execute_remote(self, args: BrowserControlArgs, ctx: ToolContext) -> Any:
        if args.is_legacy and (
            self._strict_canonical_actions_enabled() or not self._legacy_actions_allowed()
        ):
            preferred = args.preferred_action
            preferred_text = f" Use '{preferred}' instead." if preferred else ""
            if self._strict_canonical_actions_enabled():
                gate = f"{self.strict_canonical_actions_env}=1"
            else:
                gate = f"{self.allow_legacy_actions_env}=0"
            raise ValueError(
                "Legacy browser actions are disabled by "
                f"{gate}.{preferred_text}"
            )
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name=self.name,
            args=args.model_dump(exclude_defaults=True, exclude_none=True),
            request_id=request_id,
        )
