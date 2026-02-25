"""Canonical and legacy browser action contract for WindieOS sidecar."""

from __future__ import annotations

from types import MappingProxyType

BROWSER_CANONICAL_ACTIONS = frozenset(
    {
        "connect",
        "status",
        "profiles",
        "navigate",
        "click",
        "scroll",
        "screenshot",
        "wait",
        "get_tabs",
        "evaluate",
        "done",
        "search",
        "go_back",
        "search_page",
        "find_elements",
        "find_text",
        "input",
        "send_keys",
        "switch",
        "close_tab",
        "dropdown_options",
        "select_dropdown",
        "upload_file",
        "write_file",
        "replace_file",
        "read_file",
        "read_long_content",
        "snapshot",
        "extract",
        "close",
    }
)

LEGACY_BROWSER_ACTION_ALIASES = MappingProxyType(
    {
        "type": "input",
        "press": "send_keys",
        "switch_tab": "switch",
    }
)

REMOVED_BROWSER_ACTION_ALIASES = MappingProxyType(
    {
        "open": "navigate",
        "act": "canonical actions directly",
    }
)

BROWSER_COMPAT_ACTION_ALIASES = MappingProxyType(
    {**LEGACY_BROWSER_ACTION_ALIASES, **REMOVED_BROWSER_ACTION_ALIASES}
)

BROWSER_ALL_ACTIONS = frozenset(
    BROWSER_CANONICAL_ACTIONS.union(BROWSER_COMPAT_ACTION_ALIASES.keys())
)
