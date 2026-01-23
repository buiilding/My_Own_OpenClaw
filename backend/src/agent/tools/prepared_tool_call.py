"""
Prepared Tool Call.

Represents a tool call after preparation (coordinate resolution, etc.).
This is separate from ParsedToolCall to avoid mutating the original parsed response.
"""
from dataclasses import dataclass
from typing import Any, Dict, Optional

from backend.src.llm.parser import ParsedToolCall


@dataclass
class PreparedToolCall:
    """
    A tool call after preparation (coordinate resolution, etc.).
    
    This is an immutable structure that contains the resolved parameters
    ready for execution. The original ParsedToolCall is preserved for reference.
    """
    original_call: ParsedToolCall
    tool_name: str
    parameters: Dict[str, Any]
    raw_call: str
    metadata: Optional[Dict[str, Any]] = None
    
    @classmethod
    def from_parsed_call(cls, parsed_call: ParsedToolCall) -> "PreparedToolCall":
        """
        Create a PreparedToolCall from a ParsedToolCall.
        
        Args:
            parsed_call: The original parsed tool call
            
        Returns:
            PreparedToolCall with copied parameters
            
        Note: Uses shallow copy for parameters since they are typically simple
        values (strings, numbers, booleans). If nested structures are present,
        they should be immutable or not mutated after creation.
        """
        # Shallow copy parameters to avoid mutation of the original
        # Parameters are typically simple values (str, int, bool, float)
        # Nested structures should be immutable or not mutated
        parameters = dict(parsed_call.parameters) if parsed_call.parameters else {}
        
        # Metadata may contain nested structures, but typically just has request_id
        # Use shallow copy for performance (metadata is usually flat)
        metadata = dict(getattr(parsed_call, "metadata", None) or {})
        
        return cls(
            original_call=parsed_call,
            tool_name=parsed_call.tool_name,
            parameters=parameters,
            raw_call=parsed_call.raw_call,
            metadata=metadata,
        )
    
    def to_parsed_call(self) -> ParsedToolCall:
        """
        Convert back to ParsedToolCall format (for backward compatibility).
        
        Returns:
            ParsedToolCall with prepared parameters
        """
        return ParsedToolCall(
            tool_name=self.tool_name,
            parameters=self.parameters,
            raw_call=self.raw_call,
            confidence=getattr(self.original_call, "confidence", 1.0),
        )
