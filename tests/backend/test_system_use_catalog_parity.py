"""Covers system use catalog parity behavior in the backend test suite."""

from backend.src.tools.remote_tools.system import (
    _SYSTEM_USE_MODEL_BY_TOOL,
    _SYSTEM_USE_TARGET_TOOL_BY_TOOL,
)
from backend.src.tools.tool_catalog import get_tool_catalog


def test_system_tool_catalog_matches_remote_system_mapping():
    catalog_names = {
        entry.name
        for entry in get_tool_catalog()
        if entry.name in _SYSTEM_USE_MODEL_BY_TOOL or entry.name in {"open_app", "process"}
    }

    assert catalog_names == {
        "run_shell_command",
        "replace",
        "read_file",
        "get_system_stats",
        "get_open_windows",
        "open_app",
        "process",
    }
    assert set(_SYSTEM_USE_TARGET_TOOL_BY_TOOL.keys()) == set(_SYSTEM_USE_MODEL_BY_TOOL.keys())
