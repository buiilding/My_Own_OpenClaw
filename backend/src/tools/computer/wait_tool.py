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
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class WaitToolArgs(BaseModel):
    """Arguments for wait tool."""
    model_config = ConfigDict(extra='forbid')
    
    seconds: float = Field(
        ...,
        description="Number of seconds to wait. Must be between 0.1 and 300 (5 minutes)."
    )
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
    Wait for a specified number of seconds, then capture a screenshot.
    
    This tool is useful for:
    - Waiting for UI animations or transitions to complete
    - Waiting for async operations to finish
    - Waiting for page loads or content updates
    - Introducing delays between actions
    """
    name = "wait"
    required_permissions = {Permission.COMPUTER_CONTROL}
    category = ToolDomain.COMPUTER
    description = (
        "Wait for a specified number of seconds, then capture a screenshot of the current screen state. "
        "Useful for waiting for UI changes, animations, page loads, or async operations to complete. "
        "After execution, returns a status message showing how long it waited and a screenshot image."
    )
    args_model = WaitToolArgs

    def __init__(self):
        """Initialize the wait tool."""
        self.computer = ComputerInterface()

    async def run(self, args: WaitToolArgs, ctx: ToolContext) -> Dict[str, Any]:
        """
        Wait for the specified duration, then capture a screenshot.
        
        Args:
            args: Wait tool arguments
            ctx: Execution context
            
        Returns:
            Dictionary with wait status and screenshot
        """
        try:
            # Validate wait duration
            if args.seconds < 0.1:
                return {
                    "error": "Wait duration must be at least 0.1 seconds",
                    "llm_content": "Error: Wait duration must be at least 0.1 seconds"
                }
            
            if args.seconds > 300:
                return {
                    "error": "Wait duration cannot exceed 300 seconds (5 minutes)",
                    "llm_content": "Error: Wait duration cannot exceed 300 seconds (5 minutes)"
                }

            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return {
                    "error": init_error.error or "Computer interface initialization failed",
                    "llm_content": f"Error: {init_error.error or 'Computer interface initialization failed'}"
                }

            # Wait for the specified duration
            logger.debug(f"Wait tool: Waiting for {args.seconds} seconds")
            await asyncio.sleep(args.seconds)

            # Format status message
            status_message = f"Waited for {args.seconds} seconds"
            if args.seconds == 1.0:
                status_message = "Waited for 1 second"
            elif args.seconds < 1.0:
                status_message = f"Waited for {args.seconds:.2f} seconds"
            else:
                status_message = f"Waited for {args.seconds:.1f} seconds"

            return {
                "success": True,
                "seconds_waited": args.seconds,
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

