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
    _COMPUTER_USE_MODEL_BY_TOOL,
)
from backend.src.tools.tool_catalog import get_tool_catalog


def test_computer_tool_catalog_matches_remote_computer_mapping():
    catalog_names = {
        entry.name
        for entry in get_tool_catalog()
        if entry.name in _COMPUTER_USE_MODEL_BY_TOOL
    }

    assert catalog_names == set(_COMPUTER_USE_MODEL_BY_TOOL.keys())


def test_grounded_computer_tools_are_exported_and_mapped():
    expected_computer_tool_classes = {
        RemoteMouseTool,
        RemoteGroundedMouseTool,
        RemoteKeyboardTool,
        RemoteScreenshotTool,
        RemoteScrollTool,
        RemoteGroundedScrollTool,
        RemoteSwitchTabTool,
        RemoteWaitTool,
        RemoteGetOpenWindowsTool,
    }

    for tool_class in expected_computer_tool_classes:
        assert getattr(remote_exports, tool_class.__name__) is tool_class

    for tool_class in expected_computer_tool_classes - {RemoteGetOpenWindowsTool}:
        assert _COMPUTER_USE_MODEL_BY_TOOL[tool_class.name] is tool_class.args_model
