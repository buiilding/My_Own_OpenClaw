"""
Resolved Tool Call.

Represents a tool call after resolution (coordinate resolution, etc.).
This is separate from ParsedToolCall to avoid mutating the original parsed response.
Transforms high-level tool intents into concrete executable instructions.
"""
from dataclasses import dataclass
from typing import Any, Dict, Optional

from backend.src.agent.tools.preparation.types.execution_ref import ExecutionRef
from backend.src.llm.parser import ParsedToolCall


@dataclass
class ResolvedToolCall:
    """
    A tool call after resolution (coordinate resolution, etc.).

    This is an immutable structure that contains the resolved parameters
    ready for execution. The original ParsedToolCall is preserved for reference.
    
    Transforms high-level, declarative tool intents (e.g., "click on 'Submit'")
    into concrete, executable frontend instructions (e.g., "click at x=732, y=409").
    """
    original_call: ParsedToolCall
    tool_name: str
    parameters: Dict[str, Any]
    raw_call: str
    metadata: Optional[Dict[str, Any]] = None

    @property
    def execution_ref(self) -> Optional[ExecutionRef]:
        """Typed execution reference parsed from metadata."""
        return ExecutionRef.from_metadata(self.metadata)
    
    @classmethod
    def from_parsed_call(cls, parsed_call: ParsedToolCall) -> "ResolvedToolCall":
        """
        Create a ResolvedToolCall from a ParsedToolCall.
        
        Args:
            parsed_call: The original parsed tool call
            
        Returns:
            ResolvedToolCall with copied parameters
            
        Note: Uses shallow copy for parameters since they are typically simple
        values (strings, numbers, booleans). If nested structures are present,
        they should be immutable or not mutated after creation.
        """
        # Shallow copy parameters to avoid mutation of the original
        # Parameters are typically simple values (str, int, bool, float)
        # Nested structures should be immutable or not mutated
        parameters = dict(parsed_call.parameters) if parsed_call.parameters else {}
        
        # Copy metadata from parsed call (for computer-use tools: description, explanation, expectation)
        # Metadata may also contain request_id and other fields
        # Use shallow copy for performance (metadata is usually flat)
        parsed_metadata = parsed_call.metadata
        if parsed_metadata:
            metadata = dict(parsed_metadata)
        else:
            metadata = None
        
        return cls(
            original_call=parsed_call,
            tool_name=parsed_call.tool_name,
            parameters=parameters,
            raw_call=parsed_call.raw_call,
            metadata=metadata,
        )
    
