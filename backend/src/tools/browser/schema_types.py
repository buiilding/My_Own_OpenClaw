"""Shared browser schema literal aliases and contract action sets."""

from __future__ import annotations

from types import MappingProxyType
from typing import Literal, cast, get_args

BrowserNavigationState = Literal["load", "domcontentloaded", "networkidle", "commit"]
BrowserSnapshotFormat = Literal["ai", "aria"]
BrowserMouseButton = Literal["left", "right", "middle"]
BrowserScrollDirection = Literal["up", "down", "left", "right"]
BrowserWaitState = Literal["load", "domcontentloaded", "networkidle"]
BrowserCanonicalAction = Literal[
    "connect",
    "status",
    "profiles",
    "navigate",
    "snapshot",
    "extract",
    "click",
    "input",
    "send_keys",
    "scroll",
    "screenshot",
    "wait",
    "get_tabs",
    "switch",
    "evaluate",
    "done",
    "search",
    "go_back",
    "search_page",
    "find_elements",
    "find_text",
    "close_tab",
    "dropdown_options",
    "select_dropdown",
    "upload_file",
    "write_file",
    "replace_file",
    "read_file",
    "read_long_content",
    "close",
]
BrowserLegacyCompatAction = Literal[
    "type",
    "press",
    "switch_tab",
]
BrowserRemovedCompatAction = Literal[
    "open",
    "act",
]
BrowserAction = BrowserCanonicalAction | BrowserLegacyCompatAction | BrowserRemovedCompatAction

# Backward-compatible aliases for older imports.
BrowserCoreAction = BrowserCanonicalAction
BrowserOpenClawAction = Literal[
    "status",
    "profiles",
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
]

BROWSER_CANONICAL_ACTIONS = cast(
    tuple[str, ...],
    tuple(
        action
        for action in get_args(BrowserCanonicalAction)
        if isinstance(action, str)
    ),
)

BROWSER_LEGACY_COMPAT_ACTIONS = cast(
    tuple[str, ...],
    tuple(
        action
        for action in get_args(BrowserLegacyCompatAction)
        if isinstance(action, str)
    ),
)

BROWSER_REMOVED_COMPAT_ACTIONS = cast(
    tuple[str, ...],
    tuple(
        action
        for action in get_args(BrowserRemovedCompatAction)
        if isinstance(action, str)
    ),
)

BROWSER_LEGACY_ACTION_PREFERRED = MappingProxyType(
    {
        "type": "input",
        "press": "send_keys",
        "switch_tab": "switch",
    }
)

BROWSER_REMOVED_ACTION_PREFERRED = MappingProxyType(
    {
        "open": "navigate",
        "act": "canonical actions directly",
    }
)

BROWSER_COMPAT_ACTION_PREFERRED = MappingProxyType(
    {**BROWSER_LEGACY_ACTION_PREFERRED, **BROWSER_REMOVED_ACTION_PREFERRED}
)

BROWSER_ALL_ACTIONS = cast(
    tuple[str, ...],
    tuple((*BROWSER_CANONICAL_ACTIONS, *BROWSER_LEGACY_COMPAT_ACTIONS, *BROWSER_REMOVED_COMPAT_ACTIONS)),
)
