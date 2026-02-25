"""
Remote browser-domain tool stubs.
"""

from __future__ import annotations

import os
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
- compatibility aliases (legacy, deprecated): open->navigate(new_tab=true), type->input, press->send_keys, switch_tab->switch
- removed legacy alias: `act` is no longer supported; use canonical actions directly

Compatibility validation notes:
- snapshot rejects compatibility fields `format`/`snapshotFormat`/`wait_until`/`state`/`mode`/`max_chars`/`refs`/`interactive`/`compact`/`depth`/`selector`/`frame`
- extract rejects compatibility fields `mode`/`selector`/`frame`
- screenshot rejects compatibility fields `full_page`/`ref`/`element`/`type`/`quality`
- set `WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1` to reject legacy alias actions at runtime
- legacy aliases are disabled by default
- set `WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1` to temporarily re-enable legacy alias actions during migration"""
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
            return False
        return raw not in {"0", "false", "no", "off"}

    @classmethod
    def _legacy_action_block_gate(cls) -> str | None:
        if cls._strict_canonical_actions_enabled():
            return f"{cls.strict_canonical_actions_env}=1"
        if not cls._legacy_actions_allowed():
            return f"{cls.allow_legacy_actions_env}=1"
        return None

    @staticmethod
    def _log_legacy_action_warning(
        action: str,
        preferred: str | None,
        *,
        blocked: bool,
        gate: str | None = None,
    ) -> None:
        extra = {
            "legacy_action": action,
            "preferred_action": preferred,
            "legacy_action_blocked": blocked,
            "legacy_action_gate": gate,
        }
        if blocked and gate:
            if preferred:
                logger.warning(
                    "Legacy browser action '%s' blocked by %s; prefer '%s'",
                    action,
                    gate,
                    preferred,
                    extra=extra,
                )
            else:
                logger.warning(
                    "Legacy browser action '%s' blocked by %s",
                    action,
                    gate,
                    extra=extra,
                )
            return
        logger.warning(
            "Legacy browser action '%s' invoked; prefer '%s'",
            action,
            preferred or "canonical action",
            extra=extra,
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

        gate = self._legacy_action_block_gate() if args.is_legacy else None
        if gate is not None:
            preferred = args.preferred_action
            preferred_text = f" Use '{preferred}' instead." if preferred else ""
            self._log_legacy_action_warning(
                args.action,
                preferred,
                blocked=True,
                gate=gate,
            )
            raise ValueError(
                "Legacy browser actions are disabled by "
                f"{gate}.{preferred_text}"
            )
        if args.is_legacy:
            self._log_legacy_action_warning(
                args.action,
                args.preferred_action,
                blocked=False,
            )
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name=self.name,
            args=args.model_dump(exclude_defaults=True, exclude_none=True),
            request_id=request_id,
        )
