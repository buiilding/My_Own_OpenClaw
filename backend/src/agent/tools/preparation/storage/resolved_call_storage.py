"""
Resolved tool call storage for AgentSession.

Encapsulates resolved tool call storage logic to reduce
AgentSession complexity and improve modularity.
"""
from typing import Any, Dict, Optional


class ResolvedToolCallStorage:
    """
    Manages storage and retrieval of resolved tool calls.
    
    Resolved tool calls are immutable copies of parsed tool calls
    with resolved coordinates and are used by ToolOrchestrator
    during execution.
    """
    
    def __init__(self):
        """Initialize empty storage."""
        self._resolved_tool_calls: Dict[str, Any] = {}
    
    def register(self, request_id: str, resolved_call: Any) -> None:
        """
        Register a resolved tool call.
        
        ENCAPSULATION: Public method to register resolved tool calls without
        exposing private implementation details.
        
        Args:
            request_id: Request ID for the tool call
            resolved_call: Resolved tool call to store
        """
        self._resolved_tool_calls[request_id] = resolved_call
    
    def get(self, request_id: str) -> Optional[Any]:
        """
        Get a resolved tool call by request ID.
        
        ENCAPSULATION: Public method to retrieve resolved tool calls without
        exposing private implementation details.
        
        Args:
            request_id: Request ID for the tool call
            
        Returns:
            Resolved tool call or None if not found
        """
        return self._resolved_tool_calls.get(request_id)
    
    def remove(self, request_id: str) -> None:
        """
        Remove a resolved tool call from storage.
        
        ENCAPSULATION: Public method to remove resolved tool calls without
        exposing private implementation details.
        
        Args:
            request_id: Request ID for the tool call to remove
        """
        if request_id in self._resolved_tool_calls:
            del self._resolved_tool_calls[request_id]
    
    def clear(self) -> None:
        """Clear all resolved tool calls."""
        self._resolved_tool_calls.clear()
