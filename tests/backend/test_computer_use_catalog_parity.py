from backend.src.tools.remote_tools.computer import _COMPUTER_USE_MODEL_BY_TOOL
from backend.src.tools.tool_catalog import get_tool_catalog


def test_computer_tool_catalog_matches_remote_computer_mapping():
    catalog_names = {
        entry.name
        for entry in get_tool_catalog()
        if entry.name in _COMPUTER_USE_MODEL_BY_TOOL
    }

    assert catalog_names == set(_COMPUTER_USE_MODEL_BY_TOOL.keys())
