"""Covers system tool catalog parity behavior in the backend test suite."""

from backend.src.tools.remote_tools.computer import RemoteGetOpenWindowsTool
from backend.src.tools.remote_tools.filesystem import RemoteReadFileTool, RemoteReplaceTool
from backend.src.tools.remote_tools.system import (
    RemoteGetSystemStatsTool,
    RemoteOpenAppTool,
    RemoteProcessTool,
    RemoteShellTool,
)
from backend.src.tools.tool_catalog import get_remote_tool_class, get_tool_catalog


_EXPECTED_SYSTEM_TOOL_CLASSES = [
    RemoteGetOpenWindowsTool,
    RemoteGetSystemStatsTool,
    RemoteOpenAppTool,
    RemoteShellTool,
    RemoteProcessTool,
    RemoteReadFileTool,
    RemoteReplaceTool,
]


def test_system_tool_catalog_matches_direct_remote_classes():
    expected_names = [tool_class.name for tool_class in _EXPECTED_SYSTEM_TOOL_CLASSES]
    catalog_entries = [
        entry
        for entry in get_tool_catalog()
        if entry.name in expected_names
    ]

    assert [entry.name for entry in catalog_entries] == expected_names
    for entry, tool_class in zip(
        catalog_entries, _EXPECTED_SYSTEM_TOOL_CLASSES, strict=True
    ):
        assert entry.class_name == tool_class.__name__
        assert get_remote_tool_class(entry.name) is tool_class
