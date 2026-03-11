"""
Remote browser-domain tool stubs.
"""

from __future__ import annotations

from copy import deepcopy
import logging
from typing import Any

from pydantic import ValidationError

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.browser.model_facing_schemas import (
    MODEL_FACING_BROWSER_ACTION_MODELS,
)
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
    }
)

_COMPACT_BROWSER_PROPERTY_DESCRIPTIONS: dict[str, str] = {
    "action": "Browser action.",
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
        def _clean_model_schema(model: type[Any]) -> dict[str, Any]:
            raw_schema = model.model_json_schema()
            resolved_schema = self._resolve_local_defs(raw_schema)
            cleaned_schema = self._clean_schema(resolved_schema)
            cleaned_schema.pop("title", None)
            if "properties" in cleaned_schema and cleaned_schema.get("type") is None:
                cleaned_schema["type"] = "object"
            cleaned_schema["additionalProperties"] = False
            properties = cleaned_schema.get("properties")
            if isinstance(properties, dict):
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
            return cleaned_schema

        one_of = [
            _clean_model_schema(MODEL_FACING_BROWSER_ACTION_MODELS[action])
            for action in _BROWSER_EXPOSED_ACTIONS
            if action in MODEL_FACING_BROWSER_ACTION_MODELS
        ]
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "description": "Arguments for browser action execution.",
                    "additionalProperties": False,
                    "oneOf": one_of,
                },
            },
        }

    @staticmethod
    def _format_action_validation_error(action: str, exc: ValidationError) -> str:
        parts: list[str] = []
        for error in exc.errors():
            location = ".".join(str(item) for item in error.get("loc", ()) if item != "__root__")
            message = str(error.get("msg", "invalid value"))
            if location:
                parts.append(f"{location}: {message}")
            else:
                parts.append(message)
        detail = "; ".join(parts) if parts else str(exc)
        return f"Invalid browser arguments for action '{action}': {detail}"

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
        strict_model = MODEL_FACING_BROWSER_ACTION_MODELS.get(args.action)
        if strict_model is not None:
            try:
                strict_model(**args.model_dump(exclude_none=True, exclude_defaults=True))
            except ValidationError as exc:
                raise ValueError(
                    self._format_action_validation_error(args.action, exc)
                ) from exc
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name=self.name,
            args=args.model_dump(exclude_defaults=True, exclude_none=True),
            request_id=request_id,
        )
