"""
Example Marketplace Tool.

This is a simple example tool that demonstrates how to create
a marketplace tool for the Desktop Assistant.
"""

import logging
from typing import Optional

from backend.tools.base import Kind, Tool, ToolContext, ToolResult

logger = logging.getLogger(__name__)


class ExampleTool(Tool):
    """Example tool that echoes a message with a greeting."""

    def __init__(self, config):
        """
        Initialize the example tool.

        Args:
            config: AppServices instance (dependency injection)
        """
        super().__init__(
            name="example_tool",
            description="An example marketplace tool that echoes a message with a greeting. Useful for testing the marketplace system.",
            kind=Kind.OTHER,
        )
        self.config = config

    async def execute_async(
        self, context: ToolContext, message: Optional[str] = None
    ) -> ToolResult:
        """
        Execute the example tool.

        Args:
            context: Tool execution context
            message: Optional message to echo back

        Returns:
            ToolResult with greeting and echoed message
        """
        try:
            if message is None:
                message = "Hello from the marketplace!"

            greeting = f"Hello! You called the example marketplace tool."
            response = f"{greeting}\n\nYour message: {message}"

            logger.info(f"Example tool executed with message: {message}")

            return ToolResult(
                success=True,
                data={"greeting": greeting, "message": message, "response": response},
                llm_content=response,
                return_display=response,
            )

        except Exception as e:
            logger.error(f"Error in example tool: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Example tool execution failed: {str(e)}",
                llm_content=f"Error: Example tool execution failed: {str(e)}",
                return_display=f"Error: {str(e)}",
            )
