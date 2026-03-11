"""
Remote browser-domain tool stubs.
"""

from __future__ import annotations

from copy import deepcopy
import logging
from typing import Any

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.browser.schemas import BrowserControlArgs
from backend.src.tools.browser.schema_types import (
    BROWSER_CANONICAL_ACTIONS,
    BROWSER_REMOVED_COMPAT_ACTIONS,
)
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult

logger = logging.getLogger(__name__)

_BROWSER_FILE_EDIT_ACTIONS = frozenset({"write_file", "replace_file", "read_file"})
_BROWSER_EXPOSED_ACTIONS = tuple(
    action
    for action in BROWSER_CANONICAL_ACTIONS
    if action not in _BROWSER_FILE_EDIT_ACTIONS
)
_BROWSER_EXPOSED_REMOVED_PROPERTIES = frozenset(
    {
        "timeoutMs",
        "promptText",
        "colorScheme",
        "targetId",
        "targetUrl",
        "inputRef",
        "snapshotFormat",
        "content",
        "append",
        "trailing_newline",
        "leading_newline",
        "old_str",
        "new_str",
        "mode",
        "cdp_url",
        "profile",
        "node",
        "target",
        "value",
    }
)

_COMPACT_BROWSER_PROPERTY_DESCRIPTIONS: dict[str, str] = {
    "action": "Browser action.",
    "url": "URL for navigate action.",
    "wait_until": "Navigation wait condition.",
    "query": "Query text for extract/search actions.",
    "ref": "Element reference from snapshot output.",
    "index": "Element index.",
    "text": "Text payload for input, find_text, done, or select_dropdown actions.",
    "submit": "Submit after input.",
    "keys": "Key sequence for send_keys.",
    "key": "Single key value.",
    "direction": "Scroll direction.",
    "amount": "Scroll amount.",
    "seconds": "Wait duration in seconds.",
    "target_id": "Target tab id.",
    "tab_id": "Tab id.",
    "file_name": "Optional output filename.",
    "paths": "File paths for upload action.",
    "input_ref": "Input reference for upload action.",
    "script": "JavaScript code for evaluate action.",
    "code": "JavaScript code alias.",
    "offset": "Character offset for paginated reads.",
    "limit": "Maximum result count or page size.",
    "extract_links": "Include links in extracted content.",
    "start_from_char": "Character offset for extract continuation.",
    "output_schema": "Optional schema hint for extract results.",
}


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
        schema = deepcopy(super().get_json_schema())
        function = schema.get("function")
        if not isinstance(function, dict):
            return schema
        function["description"] = self.description
        parameters = function.get("parameters")
        if not isinstance(parameters, dict):
            return schema
        parameters["description"] = "Arguments for browser action execution."
        properties = parameters.get("properties")
        if not isinstance(properties, dict):
            return schema

        for field_name in _BROWSER_EXPOSED_REMOVED_PROPERTIES:
            properties.pop(field_name, None)

        for field_name, property_schema in properties.items():
            if not isinstance(property_schema, dict):
                continue
            compact = _COMPACT_BROWSER_PROPERTY_DESCRIPTIONS.get(field_name)
            if compact is None:
                property_schema.pop("description", None)
            else:
                property_schema["description"] = compact

        action_schema = properties.get("action")
        if isinstance(action_schema, dict):
            properties["action"] = {
                "type": "string",
                "description": "Browser action.",
                "enum": list(_BROWSER_EXPOSED_ACTIONS),
            }
        return schema

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
