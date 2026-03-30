"""Registry for frontend-executed remote tools."""

from __future__ import annotations

from typing import Dict, Optional, Type

from backend.src.sdk.tool import Tool
from backend.src.tools.remote_tools.browser import RemoteBrowserTool
from backend.src.tools.remote_tools.computer import (
    RemoteComputerUseTool,
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
    RemoteSystemUseTool,
)
from backend.src.tools.tool_catalog import get_tool_catalog, resolve_tool_class

REMOTE_TOOLS: Dict[str, Type[Tool]] = {
    entry.name: resolve_tool_class(entry)
    for entry in get_tool_catalog()
}


def get_remote_tool(tool_name: str) -> Optional[Type[Tool]]:
    return REMOTE_TOOLS.get(tool_name)


def get_all_remote_tools() -> Dict[str, Type[Tool]]:
    return REMOTE_TOOLS.copy()
