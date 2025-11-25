"""
Example Marketplace Tool.

This is a simple example tool that demonstrates how to create
a marketplace tool for the Desktop Assistant using the new SDK.

This tool uses the modern SDK pattern:
- Inherits from Tool[TArgs] where TArgs is a Pydantic model
- Uses Context for execution context (not ToolContext)
- Returns a dict with success/data/llm_content/return_display
"""

import logging
from typing import Dict, Any
from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

logger = logging.getLogger(__name__)


class ExampleToolArgs(BaseModel):
    """Arguments for the example tool."""
    message: str = Field(
        default="Hello from the marketplace!",
        description="The message to echo back with a greeting"
    )


class ExampleTool(Tool[ExampleToolArgs]):
    """
    Example marketplace tool that echoes a message with a greeting.
    
    This tool demonstrates the correct SDK pattern for marketplace tools.
    Useful for testing the marketplace system and as a template for new tools.
    """
    name = "example_tool"
    description = "An example marketplace tool that echoes a message with a greeting. Useful for testing the marketplace system."
    args_model = ExampleToolArgs

    async def run(self, args: ExampleToolArgs, ctx: Context) -> Dict[str, Any]:
        """
        Execute the example tool.

        Args:
            args: Validated arguments (ExampleToolArgs)
            ctx: Execution context (user, session, services)

        Returns:
            Dict with success, data, llm_content, and return_display
        """
        try:
            greeting = "Hello! You called the example marketplace tool."
            response = f"{greeting}\n\nYour message: {args.message}"

            logger.info(f"Example tool executed with message: {args.message}")

            return {
                "success": True,
                "data": {
                    "greeting": greeting,
                    "message": args.message,
                    "response": response,
                    "user_id": ctx.user.user_id,
                    "session_id": ctx.session.session_id,
                },
                "llm_content": response,
                "return_display": response,
            }

        except Exception as e:
            logger.error(f"Error in example tool: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Example tool execution failed: {str(e)}",
                "llm_content": f"Error: Example tool execution failed: {str(e)}",
                "return_display": f"Error: {str(e)}",
            }
