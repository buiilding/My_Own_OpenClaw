"""
Exports for frontend-executed remote tool stubs.
"""

from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult
from backend.src.tools.remote_tools.registry import (
    REMOTE_TOOLS,
    RemoteBrowserTool,
    RemoteGetOpenWindowsTool,
    RemoteGetSystemStatsTool,
    RemoteKeyboardTool,
    RemoteMouseTool,
    RemoteProcessTool,
    RemoteReadFileTool,
    RemoteReplaceTool,
    RemoteScreenshotTool,
    RemoteScrollTool,
    RemoteShellTool,
    RemoteSwitchTabTool,
    RemoteWaitTool,
    get_all_remote_tools,
    get_remote_tool,
)

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
    "RemoteProcessTool",
    "RemoteReadFileTool",
    "RemoteReplaceTool",
    "RemoteBrowserTool",
    "REMOTE_TOOLS",
    "get_remote_tool",
    "get_all_remote_tools",
]
