"""
Action Registry for type-safe tool action dispatch.

Provides a centralized registry for mapping action enums to handlers,
eliminating if/else dispatch chains.
"""
import logging
from typing import Any, Callable, Dict, Optional

from backend.src.sdk.context import ToolContext
from backend.src.core.interfaces.tool import ToolResult
from backend.src.core.types import MouseAction, KeyboardAction

logger = logging.getLogger(__name__)


class ActionRegistry:
    """
    Registry for tool actions.
    
    Maps action enums to handler functions, providing type-safe dispatch.
    """
    
    def __init__(self):
        """Initialize action registry."""
        self._mouse_actions: Dict[MouseAction, Callable] = {}
        self._keyboard_actions: Dict[KeyboardAction, Callable] = {}
    
    def register_mouse_action(
        self, 
        action: MouseAction, 
        handler: Callable[[Any, ToolContext], Any]
    ) -> None:
        """
        Register a mouse action handler.
        
        Args:
            action: MouseAction enum value
            handler: Async callable that takes (args, context) and returns ToolResult
        """
        self._mouse_actions[action] = handler
        logger.debug(f"Registered mouse action: {action.value}")
    
    def register_keyboard_action(
        self,
        action: KeyboardAction,
        handler: Callable[[Any, ToolContext], Any]
    ) -> None:
        """
        Register a keyboard action handler.
        
        Args:
            action: KeyboardAction enum value
            handler: Async callable that takes (args, context) and returns ToolResult
        """
        self._keyboard_actions[action] = handler
        logger.debug(f"Registered keyboard action: {action.value}")
    
    def get_mouse_action_handler(
        self, 
        action: MouseAction
    ) -> Optional[Callable]:
        """
        Get handler for a mouse action.
        
        Args:
            action: MouseAction enum value
            
        Returns:
            Handler function or None if not registered
        """
        return self._mouse_actions.get(action)
    
    def get_keyboard_action_handler(
        self,
        action: KeyboardAction
    ) -> Optional[Callable]:
        """
        Get handler for a keyboard action.
        
        Args:
            action: KeyboardAction enum value
            
        Returns:
            Handler function or None if not registered
        """
        return self._keyboard_actions.get(action)
    
    def is_mouse_action_registered(self, action: MouseAction) -> bool:
        """Check if a mouse action is registered."""
        return action in self._mouse_actions
    
    def is_keyboard_action_registered(self, action: KeyboardAction) -> bool:
        """Check if a keyboard action is registered."""
        return action in self._keyboard_actions


# Global registry instance
_action_registry: Optional[ActionRegistry] = None


def get_action_registry() -> ActionRegistry:
    """
    Get the global action registry instance.
    
    Returns:
        ActionRegistry singleton
    """
    global _action_registry
    if _action_registry is None:
        _action_registry = ActionRegistry()
    return _action_registry

