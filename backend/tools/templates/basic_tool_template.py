"""
Basic Tool Template

This is a minimal template for creating a new tool. Copy this file and customize
it for your specific use case.

Replace:
- ToolName with your tool's name
- tool_description with a description of what your tool does
- execute_async method with your tool's logic
- parameter types and validation as needed
"""

from backend.tools.base import Tool, ToolContext, ToolResult, Kind
from typing import Optional


class ToolName(Tool):
    """
    Brief description of what this tool does.

    This tool provides [specific functionality]. It's designed to be
    [simple/complex] and handles [specific use cases].
    """

    @property
    def name(self) -> str:
        return "tool_name"

    @property
    def description(self) -> str:
        return "Brief description for the LLM to understand when to use this tool"

    @property
    def kind(self) -> Kind:
        return Kind.OTHER  # Change to appropriate kind: READ, EDIT, EXECUTE, etc.

    async def execute_async(
        self,
        context: ToolContext,
        param1: str,  # Replace with actual parameters
        param2: Optional[int] = None  # Optional parameter example
    ) -> ToolResult:
        """
        Execute the tool's main functionality.

        Args:
            context: Tool execution context
            param1: Description of first parameter
            param2: Description of optional second parameter

        Returns:
            ToolResult with success status and output
        """
        try:
            # Your tool implementation here
            # Replace this with your actual tool logic

            # Example: Simple string processing
            result = f"Processed {param1}"
            if param2:
                result += f" with value {param2}"

            return ToolResult(
                success=True,
                llm_content=f"Successfully processed: {result}",
                return_display=result,
                data=result
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Tool execution failed: {str(e)}",
                llm_content=f"Error: {str(e)}",
                return_display=f"Failed: {str(e)}"
            )
