"""
Frontend Tools Package

This package contains all frontend tools organized by category.
"""

# Import all tool classes so they can be discovered by the dispatcher
from .base import FrontendTool, SimpleToolResult
from .computer import (
    MouseTool,
    KeyboardTool,
    ScreenshotTool,
    ScrollTool,
    WaitTool,
    SwitchTabTool,
    GetOpenWindowsTool,
    GetSystemStatsTool,
)
from .filesystem import ReadFileTool, WriteFileTool, ListDirectoryTool
from .memory import MemoryTool

__all__ = [
    "FrontendTool",
    "SimpleToolResult",
    "MouseTool",
    "KeyboardTool",
    "ScreenshotTool",
    "ScrollTool",
    "WaitTool",
    "SwitchTabTool",
    "GetOpenWindowsTool",
    "GetSystemStatsTool",
    "ReadFileTool",
    "WriteFileTool",
    "ListDirectoryTool",
    "MemoryTool",
]