"""
Core built-in tools for the Desktop Assistant.

This package contains all built-in tools that are always available
to the assistant, organized by functionality.
"""

from backend.tools.core.filesystem import *
from backend.tools.core.system import *
from backend.tools.core.computer import *

__all__ = [
    # Filesystem tools
    "ListDirectoryTool",
    "ReadFileTool",
    "WriteFileTool",
    "GlobTool",
    "SearchFileContentTool",
    "ReplaceTool",
    "ReadManyFilesTool",

    # System tools
    "ShellTool",

    # Computer Use Automation tools
    "ScreenshotTool",
    "MouseTool",
    "KeyboardTool",
    "ScrollTool",
]
