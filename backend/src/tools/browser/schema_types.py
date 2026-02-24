"""Shared browser schema literal aliases."""

from typing import Literal

BrowserNavigationState = Literal["load", "domcontentloaded", "networkidle", "commit"]
BrowserSnapshotFormat = Literal["ai", "aria"]
BrowserMouseButton = Literal["left", "right", "middle"]
BrowserScrollDirection = Literal["up", "down", "left", "right"]
BrowserWaitState = Literal["load", "domcontentloaded", "networkidle"]
BrowserCoreAction = Literal[
    "connect",
    "navigate",
    "snapshot",
    "extract",
    "click",
    "type",
    "press",
    "scroll",
    "screenshot",
    "wait",
    "get_tabs",
    "switch_tab",
    "evaluate",
    "close",
]
BrowserOpenClawAction = Literal[
    "status",
    "profiles",
    "open",
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
    "act",
]
BrowserAction = BrowserCoreAction | BrowserOpenClawAction
