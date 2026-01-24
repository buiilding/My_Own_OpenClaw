"""
Prepared tool call storage for AgentSession.

Encapsulates prepared tool call storage logic to reduce
AgentSession complexity and improve modularity.
"""
from typing import Any, Dict, Optional


class PreparedToolCallStorage:
    """
    Manages storage and retrieval of prepared tool calls.
    
    Prepared tool calls are immutable copies of parsed tool calls
    with resolved coordinates and are used by ToolOrchestrator
    during execution.
    """
    
    def __init__(self):
        """Initialize empty storage."""
        self._prepared_tool_calls: Dict[str, Any] = {}
    
    def register(self, request_id: str, prepared_call: Any) -> None:
        """
        Register a prepared tool call.
        
        ENCAPSULATION: Public method to register prepared tool calls without
        exposing private implementation details.
        
        Args:
            request_id: Request ID for the tool call
            prepared_call: Prepared tool call to store
        """
        self._prepared_tool_calls[request_id] = prepared_call
    
    def get(self, request_id: str) -> Optional[Any]:
        """
        Get a prepared tool call by request ID.
        
        ENCAPSULATION: Public method to retrieve prepared tool calls without
        exposing private implementation details.
        
        Args:
            request_id: Request ID for the tool call
            
        Returns:
            Prepared tool call or None if not found
        """
        return self._prepared_tool_calls.get(request_id)
    
    def remove(self, request_id: str) -> None:
        """
        Remove a prepared tool call from storage.
        
        ENCAPSULATION: Public method to remove prepared tool calls without
        exposing private implementation details.
        
        Args:
            request_id: Request ID for the tool call to remove
        """
        if request_id in self._prepared_tool_calls:
            del self._prepared_tool_calls[request_id]
    
    def clear(self) -> None:
        """Clear all prepared tool calls."""
        self._prepared_tool_calls.clear()
