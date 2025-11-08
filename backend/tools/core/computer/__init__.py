"""
Computer Use Automation (CUA) Tools

This module provides tools for controlling mouse, keyboard, and UI elements
through computer use automation capabilities.

Tools included:
- Screenshot capture
- Mouse control (click, move, drag, scroll)
- Keyboard input simulation
- Window management
- UI element detection
"""

from .computer_interface import ComputerInterface
from .screenshot_tool import ScreenshotTool
from .mouse_tool import MouseTool
from .keyboard_tool import KeyboardTool
from .scroll_tool import ScrollTool

__all__ = [
    'ComputerInterface',
    'ScreenshotTool',
    'MouseTool',
    'KeyboardTool',
    'ScrollTool',
]
