"""
Exports for frontend-executed remote tool stubs.
"""

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
from backend.src.tools.remote_tools.filesystem import (
    RemoteReadFileTool,
    RemoteReplaceTool,
)
from backend.src.tools.remote_tools.registry import REMOTE_TOOLS, get_all_remote_tools, get_remote_tool
from backend.src.tools.remote_tools.system import (
    RemoteGetSystemStatsTool,
    RemoteProcessTool,
    RemoteShellTool,
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
