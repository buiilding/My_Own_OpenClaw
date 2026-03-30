"""Canonical model-facing browser function declaration."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.browser.schema_types import BROWSER_CANONICAL_ACTIONS
from backend.src.tools.browser.schemas import BrowserControlArgs

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
_DESCRIPTION = (
    "Control the WindieOS browser instance for navigation, extraction, page "
    "interaction, tab management, and screenshots."
)


class _BrowserSchemaTool(Tool[BrowserControlArgs]):
    name = "browser"
    description = _DESCRIPTION
    args_model = BrowserControlArgs

    async def run(self, args: BrowserControlArgs, ctx: ToolContext) -> Any:  # pragma: no cover
        raise NotImplementedError


def get_browser_function_declaration() -> dict[str, Any]:
    """Build the canonical model-facing browser schema from the args model."""
    schema = deepcopy(_BrowserSchemaTool().get_json_schema())
    function = schema.get("function")
    if not isinstance(function, dict):
        return schema
    function["description"] = _DESCRIPTION
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

    properties["action"] = {
        "type": "string",
        "description": "Browser action.",
        "enum": list(_BROWSER_EXPOSED_ACTIONS),
    }
    return schema
