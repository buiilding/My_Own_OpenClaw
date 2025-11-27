"""
Keyboard Control Tool (SDK Version)

Tool for controlling keyboard input.
"""
import logging
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class KeyboardControlArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: Literal["type", "press", "hotkey"] = Field(..., description="Keyboard action to perform")
    text: Optional[str] = Field(None, description="Text to type (required for 'type' action)")
    key: Optional[str] = Field(None, description="Single key to press (required for 'press' action)")
    keys: Optional[List[str]] = Field(None, description="List of keys for hotkey (required for 'hotkey' action)")


class KeyboardTool(Tool[KeyboardControlArgs]):
    """
    Tool for controlling keyboard input.
    
    Supports typing text, pressing individual keys, and keyboard shortcuts
    for computer use automation.
    """
    
    name = "keyboard_control"
    description = "Control keyboard input including typing text, pressing keys, and keyboard shortcuts. After execution, returns a status message and a screenshot showing the screen state after the keyboard action."
    args_model = KeyboardControlArgs

    def __init__(self):
        """Initialize the keyboard tool."""
        self.computer = ComputerInterface()

    async def run(self, args: KeyboardControlArgs, ctx: Context) -> dict:
        """
        Execute keyboard control actions.
        
        Args:
            args: Keyboard control arguments
            ctx: Execution context
            
        Returns:
            Dictionary with action outcome
        """
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                # Convert ToolResult to dict
                return {
                    "error": init_error.error or "Computer interface initialization failed",
                    "llm_content": f"Error: {init_error.error or 'Computer interface initialization failed'}"
                }

            # Execute the requested action
            result = await self._execute_keyboard_action(args.action, args.text, args.key, args.keys)

            if result.success:
                return {
                    "action": args.action,
                    "input": args.text or args.key or args.keys,
                    "llm_content": result.message,
                    "return_display": result.message,
                    "metadata": {
                        "action": args.action,
                        "input_type": "text" if args.text else "key" if args.key else "keys",
                        "input_length": len(args.text) if args.text else len(args.keys) if args.keys else 1,
                    }
                }
            else:
                return {
                    "error": result.error or "Keyboard action failed",
                    "llm_content": f"Error: {result.error}"
                }

        except Exception as e:
            logger.error(f"Keyboard tool error: {e}", exc_info=True)
            return {
                "error": f"Keyboard control failed: {str(e)}",
                "llm_content": f"Error: Keyboard action failed: {str(e)}"
            }

    async def _execute_keyboard_action(
        self,
        action: str,
        text: Optional[str],
        key: Optional[str],
        keys: Optional[List[str]],
    ):
        """Execute the specific keyboard action."""
        if action == "type":
            if not text:
                return type(
                    "Result",
                    (),
                    {
                        "success": False,
                        "error": "text parameter required for type action",
                        "message": "text parameter required",
                    },
                )()
            return await self.computer.type_text(text)
        elif action == "press":
            if not key:
                return type(
                    "Result",
                    (),
                    {
                        "success": False,
                        "error": "key parameter required for press action",
                        "message": "key parameter required",
                    },
                )()
            return await self.computer.press_key(key)
        elif action == "hotkey":
            if not keys or len(keys) == 0:
                return type(
                    "Result",
                    (),
                    {
                        "success": False,
                        "error": "keys parameter required for hotkey action",
                        "message": "keys parameter required",
                    },
                )()
            return await self.computer.hotkey(*keys)
        else:
            return type(
                "Result",
                (),
                {"success": False, "error": f"Unknown keyboard action: {action}", "message": f"Unknown action: {action}"},
            )()
