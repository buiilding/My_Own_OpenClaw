"""
Tool Action Registry System.

Provides type-safe action dispatch for tool operations.
"""

from backend.src.tools.actions.protocol import ToolAction
from backend.src.tools.actions.registry import ActionRegistry, get_action_registry

__all__ = [
    "ToolAction",
    "ActionRegistry",
    "get_action_registry",
]

