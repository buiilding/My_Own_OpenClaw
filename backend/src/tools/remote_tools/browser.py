"""
Remote browser-domain tool stubs.
"""

from __future__ import annotations

import logging
from typing import Any

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.browser.schemas import BrowserControlArgs
from backend.src.tools.browser.schema_types import BROWSER_REMOVED_COMPAT_ACTIONS
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult

logger = logging.getLogger(__name__)


def _removed_legacy_alias_error(action: str, preferred: str | None) -> str:
    preferred_text = preferred or "canonical browser actions directly"
    return f"Legacy browser action '{action}' has been removed. Use {preferred_text}."


def _legacy_action_warning_message(
    action: str,
    preferred: str | None,
    *,
    blocked: bool,
    gate: str | None = None,
) -> str:
    if blocked and gate:
        preferred_text = f"; prefer '{preferred}'" if preferred else ""
        return f"Legacy browser action '{action}' blocked by {gate}{preferred_text}"
    preferred_text = preferred or "canonical action"
    return f"Legacy browser action '{action}' invoked; prefer '{preferred_text}'"


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
- removed legacy aliases: `type` (use `input`), `open` (use `navigate`), `switch_tab` (use `switch`), `press` (use `send_keys`), and `act` (use canonical actions directly)

Compatibility validation notes:
- snapshot rejects compatibility fields `format`/`snapshotFormat`/`wait_until`/`state`/`mode`/`max_chars`/`refs`/`interactive`/`compact`/`depth`/`selector`/`frame`
- extract rejects compatibility fields `mode`/`selector`/`frame`
- screenshot rejects compatibility fields `full_page`/`ref`/`element`/`type`/`quality`"""
    args_model = BrowserControlArgs
    category = ToolDomain.BROWSER

    @staticmethod
    def _log_legacy_action_warning(
        action: str,
        preferred: str | None,
        *,
        blocked: bool,
        gate: str | None = None,
    ) -> None:
        logger.warning(
            _legacy_action_warning_message(
                action,
                preferred,
                blocked=blocked,
                gate=gate,
            ),
            extra=dict(
                legacy_action=action,
                preferred_action=preferred,
                legacy_action_blocked=blocked,
                legacy_action_gate=gate,
            ),
        )

    async def execute_remote(self, args: BrowserControlArgs, ctx: ToolContext) -> Any:
        if args.action in BROWSER_REMOVED_COMPAT_ACTIONS:
            self._log_legacy_action_warning(
                args.action,
                preferred=args.preferred_action,
                blocked=True,
                gate="legacy_alias_removed",
            )
            raise ValueError(
                _removed_legacy_alias_error(args.action, args.preferred_action)
            )
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name=self.name,
            args=args.model_dump(exclude_defaults=True, exclude_none=True),
            request_id=request_id,
        )
