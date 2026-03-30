"""
Remote browser-domain tool stubs.
"""

from __future__ import annotations

import logging
from typing import Any

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.browser.model_schema import get_browser_function_declaration
from backend.src.tools.browser.schemas import BrowserControlArgs
from backend.src.tools.browser.schema_types import (
    BROWSER_REMOVED_COMPAT_ACTIONS,
)
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
    description = (
        "Control the WindieOS browser instance for navigation, extraction, page "
        "interaction, tab management, and screenshots."
    )
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

    def get_json_schema(self) -> dict[str, Any]:
        return get_browser_function_declaration()

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
