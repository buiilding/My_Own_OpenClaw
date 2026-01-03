"""
Wait Tool (SDK Version)

Tool for waiting a specified number of seconds, then capturing a screenshot.
Useful for waiting for UI changes, animations, or async operations to complete.
"""
import asyncio
import logging
from typing import Dict, Any
from pydantic import BaseModel, Field, ConfigDict

from backend.src.core.security.policy import Permission
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.computer_legacy.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class WaitToolArgs(BaseModel):
    """Arguments for wait tool."""
    model_config = ConfigDict(extra='forbid')

    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this action executes."
    )


class WaitTool(Tool[WaitToolArgs]):
    """
    Wait for 1 second, then capture a screenshot.

    This tool is useful for:
    - Waiting for UI animations or transitions to complete
    - Waiting for async operations to finish
    - Waiting for page loads or content updates
    - Introducing brief delays between actions

    Always waits exactly 1 second before capturing a screenshot.
    """
    name = "wait"
    required_permissions = {Permission.COMPUTER_CONTROL}
    category = ToolDomain.COMPUTER
    description = (
        "Wait for 1 second, then capture a screenshot of the current screen state. "
        "Useful for waiting for UI changes, animations, page loads, or async operations to complete. "
        "After execution, returns a status message and a screenshot image."
    )
    args_model = WaitToolArgs

    def __init__(self):
        """Initialize the wait tool."""
        self.computer = ComputerInterface()

    async def run(self, args: WaitToolArgs, ctx: ToolContext) -> Dict[str, Any]:
        """
        Wait for 1 second, then capture a screenshot.

        Args:
            args: Wait tool arguments
            ctx: Execution context

        Returns:
            Dictionary with wait status and screenshot
        """
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return {
                    "error": init_error.error or "Computer interface initialization failed",
                    "llm_content": f"Error: {init_error.error or 'Computer interface initialization failed'}"
                }

            # Wait for 1 second
            logger.debug("Wait tool: Waiting for 1 second")
            await asyncio.sleep(1.0)

            status_message = "Waited for 1 second"

            return {
                "success": True,
                "seconds_waited": 1.0,
                "status": status_message,
                "llm_content": f"status: {status_message}",
                "return_display": status_message
            }

        except asyncio.CancelledError:
            logger.warning("Wait tool: Wait was cancelled")
            return {
                "error": "Wait was cancelled",
                "llm_content": "Error: Wait operation was cancelled"
            }
        except Exception as e:
            logger.error(f"Wait tool: Unexpected error - {e}", exc_info=True)
            return {
                "error": str(e),
                "llm_content": f"Error: {str(e)}"
            }

