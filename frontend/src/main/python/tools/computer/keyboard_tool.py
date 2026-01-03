"""
Frontend Keyboard Control Tool

Simplified keyboard control tool for the frontend sidecar.
Supports typing text, pressing keys, and keyboard shortcuts.
"""

import logging
from typing import List, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)

KeyboardAction = Literal["type", "press", "hotkey"]


class KeyboardControlArgs(BaseModel):
    """Arguments for keyboard control tool."""
    action: KeyboardAction = Field(..., description="Keyboard action to perform")
    text: Optional[str] = Field(None, description="Text to type (required for 'type' action)")
    key: Optional[str] = Field(None, description="Single key to press (required for 'press' action)")
    keys: Optional[List[str]] = Field(None, description="List of keys for hotkey (required for 'hotkey' action)")

    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after this keyboard action executes."
    )


class KeyboardTool(FrontendTool[KeyboardControlArgs]):
    """
    Keyboard control tool for typing text, pressing keys, and keyboard shortcuts.

    Supports typing text, pressing individual keys, and keyboard shortcuts
    for computer use automation.
    """

    name = "keyboard_control"
    description = "Control keyboard input including typing text, pressing keys, and keyboard shortcuts."
    args_model = KeyboardControlArgs
    auto_capture_image = "screenshot"

    def __init__(self):
        self._pyautogui = None
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize pyautogui for keyboard control."""
        if self._initialized:
            return True

        try:
            import pyautogui
            self._pyautogui = pyautogui

            # Configure pyautogui
            pyautogui.FAILSAFE = True
            pyautogui.PAUSE = 0.01

            self._initialized = True
            logger.info("Keyboard tool initialized")
            return True

        except ImportError:
            logger.error("pyautogui not installed. Install with: pip install pyautogui")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize keyboard tool: {e}")
            return False

    async def run(self, args: KeyboardControlArgs) -> Dict[str, Any]:
        """
        Execute keyboard control actions.

        Args:
            args: Validated keyboard control arguments

        Returns:
            Result dictionary with success status and action details
        """
        try:
            # Ensure initialized
            if not await self.initialize():
                return SimpleToolResult.failure("Keyboard tool initialization failed").to_dict()

            logger.debug(f"Keyboard tool: Executing {args.action}")

            # Execute the requested action
            result = await self._execute_keyboard_action(args)

            if not result.success:
                return SimpleToolResult.failure(f"Keyboard action failed: {result.error}").to_dict()

            # Format input description for metadata
            input_desc = args.text or args.key or str(args.keys) if args.keys else "unknown"

            return {
                "success": True,
                "data": {
                    "action": args.action,
                    "input": input_desc,
                    "message": result.message,
                    "llm_content": result.message,
                    "return_display": result.message,
                    "metadata": {
                        "action": args.action,
                        "input_type": "text" if args.text else "key" if args.key else "keys",
                        "input_length": len(args.text) if args.text else len(args.keys) if args.keys else 1,
                    }
                }
            }

        except Exception as e:
            logger.error(f"Keyboard tool error: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Keyboard action failed: {str(e)}").to_dict()

    async def _execute_keyboard_action(self, args: KeyboardControlArgs):
        """Execute the specific keyboard action."""
        import asyncio
        from core.thread_pool import get_executor

        loop = asyncio.get_running_loop()
        executor = get_executor()

        try:
            if args.action == "type":
                if not args.text:
                    return SimpleToolResult.failure("text parameter required for type action")

                # Safety check: text length
                if len(args.text) > 10000:  # Max text length
                    return SimpleToolResult.failure(f"Text too long: {len(args.text)} characters (max 10000)")

                await loop.run_in_executor(executor, self._pyautogui.typewrite, args.text)
                text_preview = args.text[:50] + "..." if len(args.text) > 50 else args.text
                return SimpleToolResult.success(f"Typed text: '{text_preview}'")

            elif args.action == "press":
                if not args.key:
                    return SimpleToolResult.failure("key parameter required for press action")

                await loop.run_in_executor(executor, self._pyautogui.press, args.key)
                return SimpleToolResult.success(f"Pressed key: {args.key}")

            elif args.action == "hotkey":
                if not args.keys or len(args.keys) == 0:
                    return SimpleToolResult.failure("keys parameter required for hotkey action")

                # Safety check for dangerous key combinations
                dangerous_combos = [
                    ["alt", "f4"],  # Close window
                    ["ctrl", "alt", "del"],  # Task manager
                    ["ctrl", "shift", "esc"],  # Task manager alternative
                ]

                keys_lower = [k.lower() for k in args.keys]
                for combo in dangerous_combos:
                    if all(key in keys_lower for key in combo):
                        return SimpleToolResult.failure(f"Dangerous key combination blocked: {' + '.join(combo)}")

                await loop.run_in_executor(executor, self._pyautogui.hotkey, *args.keys)
                return SimpleToolResult.success(f"Pressed hotkey: {' + '.join(args.keys)}")

            else:
                return SimpleToolResult.failure(f"Unknown keyboard action: {args.action}")

        except Exception as e:
            return SimpleToolResult.failure(f"Keyboard action execution failed: {str(e)}")
