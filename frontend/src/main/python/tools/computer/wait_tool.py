"""
Frontend Wait Tool

Tool for waiting 1 second, then capturing a screenshot.
"""

import asyncio
import logging
from typing import Dict, Any
from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)


class WaitToolArgs(BaseModel):
    """Arguments for wait tool."""
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this action executes."
    )


class WaitTool(FrontendTool[WaitToolArgs]):
    """
    Wait for 1 second, then capture a screenshot.
    """

    name = "wait"
    description = (
        "Wait for 1 second, then capture a screenshot of the current screen state. "
        "Useful for waiting for UI changes, animations, page loads, or async operations to complete. "
        "After execution, returns a status message and a screenshot image."
    )
    args_model = WaitToolArgs
    auto_capture_image = "screenshot"

    async def run(self, args: WaitToolArgs) -> Dict[str, Any]:
        """
        Wait for 1 second.

        Args:
            args: Wait tool arguments

        Returns:
            Dictionary with wait status
        """
        try:
            # Wait for 1 second
            logger.debug("Wait tool: Waiting for 1 second")
            await asyncio.sleep(1.0)

            status_message = "Waited for 1 second"

            return {
                "success": True,
                "data": {
                    "seconds_waited": 1.0,
                    "status": status_message,
                    "llm_content": f"status: {status_message}",
                    "return_display": status_message,
                }
            }

        except asyncio.CancelledError:
            logger.warning("Wait tool: Wait was cancelled")
            return SimpleToolResult.failure("Wait was cancelled").to_dict()
        except Exception as e:
            logger.error(f"Wait tool: Unexpected error - {e}", exc_info=True)
            return SimpleToolResult.failure(f"Wait operation failed: {str(e)}").to_dict()
