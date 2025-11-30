"""
Computer Use Plugin for Agent.

This plugin handles automatic screenshot capture after computer control tool execution,
enabling visual feedback for the agent during computer automation tasks.
"""
import asyncio
import logging
from typing import Any, Optional, Set

from backend.src.agent.plugins.interface import AgentPlugin, PluginResult
from backend.src.tools.execution.engine import (
    ToolExecutionEngine,
    create_execution_engine_from_registry,
)
from backend.src.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)

# Constants
SCREENSHOT_TOOL_NAME = "screenshot"
SCREENSHOT_DATA_KEY = "screenshot"

# Computer control tools that should trigger automatic screenshots
COMPUTER_CONTROL_TOOLS: Set[str] = {
    "mouse_control",
    "keyboard_control",
    "scroll_control",
    "click_ocr_element",
    "predict_click",
}


class ComputerUsePlugin(AgentPlugin):
    """
    Plugin that handles computer use capabilities like auto-screenshots.
    Refactored to work with SDK tools and optimize flow.
    """

    name = "computer_use"

    def __init__(self, screenshot_delay: float = 0.5):
        self.tool_registry: Optional[ToolRegistry] = None
        self.execution_engine: Optional[ToolExecutionEngine] = None
        self.screenshot_delay = screenshot_delay

    async def initialize(self, container: Any = None) -> None:
        """Initialize the plugin with dependencies from the container."""
        if container:
            self.tool_registry = container.tool_registry
            self.execution_engine = create_execution_engine_from_registry(
                self.tool_registry
            )
            # Optional: configure screenshot delay from config if available
            if hasattr(container, "config") and hasattr(
                container.config, "screenshot_delay_after_action"
            ):
                self.screenshot_delay = container.config.screenshot_delay_after_action
            logger.info(
                "ComputerUsePlugin initialized with ToolRegistry from container"
            )
        else:
            logger.warning(
                "ComputerUsePlugin initialized without container, some features may fail"
            )

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """
        After computer control tools execute, capture a screenshot.

        Handles both dict (SDK) and ToolResult results.
        """
        logger.debug(f"ComputerUsePlugin.on_tool_end called for tool: {tool_name}")

        if not self.execution_engine:
            logger.warning("ToolExecutionEngine not available in ComputerUsePlugin")
            return None

        if tool_name not in COMPUTER_CONTROL_TOOLS:
            return None

        # Wait for UI to update
        await asyncio.sleep(self.screenshot_delay)

        # Execute screenshot tool using ToolExecutionEngine
        try:
            screenshot_result = await self.execution_engine.execute_tool_by_name(
                SCREENSHOT_TOOL_NAME, {}
            )
            screenshot_data = self._extract_screenshot_data(screenshot_result)

            if not screenshot_data:
                logger.warning(
                    f"Failed to extract screenshot data after {tool_name}. "
                    f"Result keys: {list(screenshot_result.keys()) if isinstance(screenshot_result, dict) else 'N/A'}"
                )
                return None

            logger.debug(f"Screenshot captured successfully after {tool_name}")

            # Provide raw screenshot data for history/display
            return PluginResult(
                artifacts={
                    "screenshot": screenshot_data,  # Raw base64 data
                }
            )

        except Exception as e:
            logger.error(
                f"Error capturing screenshot after {tool_name}: {e}", exc_info=True
            )
            return None

    def _extract_screenshot_data(self, result: Any) -> Optional[str]:
        """
        Extract screenshot data from tool execution result.

        Handles SDK tool result format (dict) and validates the data.

        Args:
            result: Tool execution result (dict or legacy ToolResult)

        Returns:
            Screenshot data string (base64) or None if not found/invalid
        """
        if not isinstance(result, dict):
            logger.warning(f"Unexpected result type: {type(result)}, expected dict")
            return None

        # Check execution success
        if not result.get("success", True):
            error = result.get("error", "Unknown error")
            logger.warning(f"Screenshot tool execution failed: {error}")
            return None

        # Extract screenshot data - SDK tools return it directly in the result dict
        screenshot_data = result.get(SCREENSHOT_DATA_KEY)

        # Validate screenshot data
        if not screenshot_data:
            return None

        if not isinstance(screenshot_data, str):
            logger.warning(
                f"Invalid screenshot data type: {type(screenshot_data)}, expected str"
            )
            return None

        return screenshot_data
