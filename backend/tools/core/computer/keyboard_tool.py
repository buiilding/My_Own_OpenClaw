"""
Keyboard Control Tool

Provides keyboard input simulation capabilities including typing text and pressing keys.
"""

from backend.tools.base import Tool, ToolContext, ToolResult, Kind
from backend.config import AppServices
from .computer_interface import ComputerInterface, KeyType
from typing import Optional, Dict, Any, List, Union
import logging

logger = logging.getLogger(__name__)


class KeyboardTool(Tool):
    """
    Tool for controlling keyboard input.

    Supports typing text, pressing individual keys, and keyboard shortcuts
    for computer use automation.
    """

    def __init__(self, config: AppServices):
        super().__init__(
            name="keyboard_control",
            description="Control keyboard input including typing text, pressing keys, and keyboard shortcuts.",
            kind=Kind.EXECUTE
        )
        self.config = config
        self.computer = ComputerInterface()

    async def execute_async(
        self,
        context: ToolContext,
        action: str,
        text: Optional[str] = None,
        key: Optional[KeyType] = None,
        keys: Optional[List[KeyType]] = None,
        **kwargs
    ) -> ToolResult:
        """
        Execute keyboard control actions.

        Args:
            context: Tool execution context
            action: Keyboard action to perform ("type", "press", "hotkey")
            text: Text to type (for "type" action)
            key: Single key to press (for "press" action)
            keys: List of keys for hotkey (for "hotkey" action)

        Returns:
            ToolResult with action outcome
        """
        try:
            # Initialize computer interface if needed
            if not hasattr(self.computer, '_initialized') or not self.computer._initialized:
                success = await self.computer.initialize()
                if not success:
                    return ToolResult(
                        success=False,
                        error="Failed to initialize computer interface",
                        llm_content="Error: Could not initialize keyboard control",
                        return_display="Keyboard control failed: Interface not available"
                    )

            # Execute the requested action
            result = await self._execute_keyboard_action(action, text, key, keys)

            if result.success:
                return ToolResult(
                    success=True,
                    data={"action": action, "input": text or key or keys},
                    llm_content=result.message,
                    return_display=result.message,
                    metadata={
                        "action": action,
                        "input_type": "text" if text else "key" if key else "keys",
                        "input_length": len(text) if text else len(keys) if keys else 1
                    }
                )
            else:
                return ToolResult(
                    success=False,
                    error=result.error or "Keyboard action failed",
                    llm_content=f"Error: {result.error}",
                    return_display=f"Keyboard action failed: {result.error}"
                )

        except Exception as e:
            logger.error(f"Keyboard tool error: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Keyboard control failed: {str(e)}",
                llm_content="Error: Keyboard action failed",
                return_display=f"Keyboard error: {str(e)}"
            )

    async def _execute_keyboard_action(
        self,
        action: str,
        text: Optional[str],
        key: Optional[KeyType],
        keys: Optional[List[KeyType]]
    ):
        """Execute the specific keyboard action."""
        if action == "type":
            if not text:
                return type('Result', (), {'success': False, 'error': 'text parameter required for type action'})()
            return await self.computer.type_text(text)
        elif action == "press":
            if not key:
                return type('Result', (), {'success': False, 'error': 'key parameter required for press action'})()
            return await self.computer.press_key(key)
        elif action == "hotkey":
            if not keys or len(keys) == 0:
                return type('Result', (), {'success': False, 'error': 'keys parameter required for hotkey action'})()
            return await self.computer.hotkey(*keys)
        else:
            return type('Result', (), {'success': False, 'error': f'Unknown keyboard action: {action}'})()

    def validate_parameters(self, **kwargs) -> List[str]:
        """Validate keyboard tool parameters."""
        errors = []

        # Check required action parameter
        if 'action' not in kwargs:
            errors.append("action parameter is required")
            return errors

        action = kwargs['action']

        # Validate action type
        valid_actions = ["type", "press", "hotkey"]
        if action not in valid_actions:
            errors.append(f"action must be one of: {', '.join(valid_actions)}")

        # Validate action-specific parameters
        if action == "type":
            if 'text' not in kwargs or not kwargs['text']:
                errors.append("text parameter is required for type action")
            elif not isinstance(kwargs['text'], str):
                errors.append("text must be a string")

        elif action == "press":
            if 'key' not in kwargs or not kwargs['key']:
                errors.append("key parameter is required for press action")
            elif not isinstance(kwargs['key'], str):
                errors.append("key must be a string")

        elif action == "hotkey":
            if 'keys' not in kwargs or not kwargs['keys']:
                errors.append("keys parameter is required for hotkey action")
            elif not isinstance(kwargs['keys'], list):
                errors.append("keys must be a list of strings")
            elif len(kwargs['keys']) == 0:
                errors.append("keys list cannot be empty")
            elif not all(isinstance(k, str) for k in kwargs['keys']):
                errors.append("all keys must be strings")

        return errors

    def get_capabilities(self) -> Dict[str, Any]:
        """Get tool capabilities."""
        capabilities = super().get_capabilities()
        capabilities.update({
            "supported_actions": ["type", "press", "hotkey"],
            "supported_keys": [
                "a-z", "0-9", "enter", "esc", "tab", "space", "backspace", "delete",
                "f1-f12", "ctrl", "alt", "shift", "win", "up", "down", "left", "right",
                "home", "end", "pageup", "pagedown"
            ],
            "max_text_length": 10000,  # Reasonable limit for typing
            "requires_confirmation": False,
            "destructive": False,  # Keyboard input itself isn't destructive
            "safe": True,
        })
        return capabilities
