"""Covers computer tool catalog parity behavior in the backend test suite."""

import backend.src.tools.remote as remote_exports
from backend.src.tools.remote_tools.computer import (
    RemoteGetOpenWindowsTool,
    RemoteGroundedMouseTool,
    RemoteGroundedScrollTool,
    RemoteKeyboardTool,
    RemoteMouseTool,
    RemoteScreenshotTool,
    RemoteScrollTool,
    RemoteSwitchTabTool,
    RemoteWaitTool,
)
from backend.src.tools.tool_catalog import get_remote_tool_class, get_tool_catalog


_EXPECTED_COMPUTER_TOOL_CLASSES = [
    RemoteMouseTool,
    RemoteGroundedMouseTool,
    RemoteKeyboardTool,
    RemoteScreenshotTool,
    RemoteScrollTool,
    RemoteGroundedScrollTool,
    RemoteSwitchTabTool,
    RemoteWaitTool,
    RemoteGetOpenWindowsTool,
]


def test_computer_tool_catalog_matches_remote_computer_classes():
    catalog_entries = [
        entry
        for entry in get_tool_catalog()
        if entry.module_path == "backend.src.tools.remote_tools.computer"
    ]

    assert [entry.name for entry in catalog_entries] == [
        tool_class.name for tool_class in _EXPECTED_COMPUTER_TOOL_CLASSES
    ]
    for entry, tool_class in zip(
        catalog_entries, _EXPECTED_COMPUTER_TOOL_CLASSES, strict=True
    ):
        assert entry.class_name == tool_class.__name__
        assert get_remote_tool_class(entry.name) is tool_class


def test_computer_tools_are_exported():
    for tool_class in _EXPECTED_COMPUTER_TOOL_CLASSES:
        assert getattr(remote_exports, tool_class.__name__) is tool_class
