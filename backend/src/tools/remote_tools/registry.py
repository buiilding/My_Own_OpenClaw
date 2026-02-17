"""
Registry for frontend-executed remote tools.
"""

from __future__ import annotations

from typing import Dict, Optional, Type

from backend.src.sdk.tool import Tool
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
from backend.src.tools.remote_tools.system import (
    RemoteGetSystemStatsTool,
    RemoteProcessTool,
    RemoteShellTool,
)

REMOTE_TOOLS: Dict[str, Type[Tool]] = {
    "mouse_control": RemoteMouseTool,
    "keyboard_control": RemoteKeyboardTool,
    "screenshot": RemoteScreenshotTool,
    "scroll_control": RemoteScrollTool,
    "switch_tab": RemoteSwitchTabTool,
    "wait": RemoteWaitTool,
    "get_open_windows": RemoteGetOpenWindowsTool,
    "get_system_stats": RemoteGetSystemStatsTool,
    "run_shell_command": RemoteShellTool,
    "process": RemoteProcessTool,
    "read_file": RemoteReadFileTool,
    "replace": RemoteReplaceTool,
    "browser": RemoteBrowserTool,
}


def get_remote_tool(tool_name: str) -> Optional[Type[Tool]]:
    return REMOTE_TOOLS.get(tool_name)


def get_all_remote_tools() -> Dict[str, Type[Tool]]:
    return REMOTE_TOOLS.copy()
