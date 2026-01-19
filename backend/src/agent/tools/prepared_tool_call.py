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
        """
        # Deep copy parameters to avoid mutation
        import copy
        return cls(
            original_call=parsed_call,
            tool_name=parsed_call.tool_name,
            parameters=copy.deepcopy(parsed_call.parameters),
            raw_call=parsed_call.raw_call,
            metadata=copy.deepcopy(getattr(parsed_call, "metadata", None) or {}),
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
