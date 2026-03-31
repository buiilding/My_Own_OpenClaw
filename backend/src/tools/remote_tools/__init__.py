"""Exports for frontend-executed remote tool stubs."""

from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult
from backend.src.tools.remote_tools.browser import RemoteBrowserTool
from backend.src.tools.remote_tools.computer import (
    RemoteGetOpenWindowsTool,
    RemoteKeyboardTool,
    RemoteMouseTool,
    RemoteScreenshotTool,
    RemoteScrollTool,
    RemoteSwitchTabTool,
    RemoteWaitTool,
)
from backend.src.tools.remote_tools.filesystem import RemoteReadFileTool, RemoteReplaceTool
from backend.src.tools.remote_tools.system import (
    RemoteGetSystemStatsTool,
    RemoteOpenAppTool,
    RemoteProcessTool,
    RemoteShellTool,
)
from backend.src.tools.tool_catalog import get_all_remote_tool_classes, get_remote_tool_class

REMOTE_TOOLS = get_all_remote_tool_classes()


def get_remote_tool(tool_name: str):
    return get_remote_tool_class(tool_name)


def get_all_remote_tools():
    return REMOTE_TOOLS.copy()

__all__ = [
    "RemoteToolBase",
    "RemoteToolResult",
    "RemoteMouseTool",
    "RemoteKeyboardTool",
    "RemoteScreenshotTool",
    "RemoteScrollTool",
    "RemoteSwitchTabTool",
    "RemoteWaitTool",
    "RemoteGetOpenWindowsTool",
    "RemoteGetSystemStatsTool",
    "RemoteShellTool",
    "RemoteOpenAppTool",
    "RemoteProcessTool",
    "RemoteReadFileTool",
    "RemoteReplaceTool",
    "RemoteBrowserTool",
    "REMOTE_TOOLS",
    "get_remote_tool",
    "get_all_remote_tools",
]
