"""
Synthetic Result Factory.

Creates synthetic tool results for error handling.
Pure factory: no side effects, deterministic output.
"""
import logging
from typing import TYPE_CHECKING

from backend.src.core.interfaces.tool import ToolResult

if TYPE_CHECKING:
    from backend.src.llm.parser import ParsedToolCall

logger = logging.getLogger(__name__)


class SyntheticResultFactory:
    """
    Factory for creating synthetic tool results.
    
    Responsibility: Error object creation only.
    No side effects, no state mutation.
    """

    @staticmethod
    def create(
        tool_call: "ParsedToolCall", error_msg: str
    ) -> ToolResult:
        """
        Create a synthetic tool result for coordinate resolution failures.
        
        Creates a pre-formatted error result that can be sent to LLM as tool output.
        No system context or screenshot needed for error results.
        
        Args:
            tool_call: The tool call that failed
            error_msg: Error message to include in result
            
        Returns:
            ToolResult with error information, pre-formatted for history
        """
        return ToolResult(
            success=False,
            error=error_msg,
            llm_content=f"Error: {error_msg}",
            data={"error": error_msg, "tool_name": tool_call.tool_name},
            metadata={"is_preformatted": True},
        )
