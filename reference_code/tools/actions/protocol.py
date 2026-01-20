"""
Tool Action Protocol.

Defines the interface for tool actions.
"""
from typing import Protocol, Any

from backend.src.sdk.context import ToolContext
from backend.src.core.interfaces.tool import ToolResult


class ToolAction(Protocol):
    """
    Protocol for tool actions.
    
    Actions are callable objects that execute specific tool operations.
    This provides type-safe action dispatch without if/else chains.
    """
    
    name: str
    """Name of the action."""
    
    async def __call__(self, context: ToolContext, args: Any) -> ToolResult:
        """
        Execute the action.
        
        Args:
            context: Tool execution context
            args: Action-specific arguments
            
        Returns:
            Tool execution result
        """
        ...

