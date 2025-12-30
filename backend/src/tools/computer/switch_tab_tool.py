"""
Switch Tab Tool for Computer Use Automation

Allows switching to a specific window/tab by name from the list of open windows.
"""

import logging
from typing import Type

from pydantic import BaseModel, Field

from backend.src.core.security.policy import Permission
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.services.system_monitor import system_monitor
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class SwitchTabArgs(BaseModel):
    """Arguments for switching to a specific tab/window."""
    model_config = {'extra': 'forbid'}

    tab_name: str = Field(
        ...,
        description="The exact name of the tab/window to switch to, as it appears in get_open_windows output."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after switching to this tab."
    )


class SwitchTabTool(Tool[SwitchTabArgs]):
    """
    Tool to switch to a specific tab/window by name.

    Uses the window title matching from get_open_windows to switch focus
    to the specified window. Particularly useful for switching between
    browser tabs, application windows, or any named UI element.
    """
    name = "switch_tab"
    description = "Switch focus to a specific window/tab by name. Use this to navigate between open windows or browser tabs using the exact name shown in get_open_windows."
    args_model = SwitchTabArgs
    required_permissions = {Permission.COMPUTER_CONTROL}
    category = ToolDomain.COMPUTER

    def __init__(self):
        self.computer = ComputerInterface()

    async def run(self, args: SwitchTabArgs, ctx: ToolContext) -> dict:
        """
        Switch to the specified tab/window and capture a screenshot.

        Args:
            args: Switch tab arguments
            ctx: Execution context

        Returns:
            Dictionary with switch result and screenshot
        """
        try:
            logger.info(f"Switching to tab/window: {args.tab_name}")

            # Attempt to switch to the window
            success = system_monitor.switch_to_window(args.tab_name)

            if not success:
                error_msg = f"Could not find or switch to window/tab with name: {args.tab_name}"
                logger.warning(error_msg)

                return {
                    "error": error_msg,
                    "llm_content": f"Error: {error_msg}. Make sure the tab/window name matches exactly what appears in get_open_windows output."
                }

            # Success response
            success_msg = f"Successfully switched to tab '{args.tab_name}'"

            return {
                "success": True,
                "tab_name": args.tab_name,
                "llm_content": success_msg,
                "return_display": success_msg
            }

        except Exception as e:
            error_msg = f"Tab switching operation failed: {str(e)}"
            logger.error(f"Switch tab tool error: {e}", exc_info=True)

            return {
                "error": error_msg,
                "llm_content": f"Error: {error_msg}"
            }
