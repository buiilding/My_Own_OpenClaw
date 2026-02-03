"""
Input type aliases for the legacy computer interface.
"""

from typing import Literal

MouseButton = Literal["left", "right", "middle"]
NavigationKey = Literal[
    "pagedown", "pageup", "home", "end", "left", "right", "up", "down"
]
SpecialKey = Literal["enter", "esc", "tab", "space", "backspace", "del"]
ModifierKey = Literal["ctrl", "alt", "shift", "win", "command", "option"]
FunctionKey = Literal[
    "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12"
]
KeyType = str
