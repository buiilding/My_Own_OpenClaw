"""
Computer Use Plugin for Agent.

This plugin handles automatic screenshot capture after computer control tool execution,
enabling visual feedback for the agent during computer automation tasks.
"""
import asyncio
import logging
from typing import Any, Optional, Set

from backend.src.agent.plugins.interface import AgentPlugin, PluginResult
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.execution.engine import (
    ToolExecutionEngine,
    create_execution_engine_from_registry,
)
from backend.src.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)

# Constants
SCREENSHOT_TOOL_NAME = "screenshot"
SCREENSHOT_DATA_KEY = "screenshot"


class ComputerUsePlugin(AgentPlugin):
    """
    Plugin that handles computer use capabilities like auto-screenshots.
    Refactored to work with SDK tools and optimize flow.
    """

    name = "computer_use"

    def __init__(self, screenshot_delay: float = 2.0):
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

        if not self.execution_engine or not self.tool_registry:
            logger.error("ToolExecutionEngine or ToolRegistry not available in ComputerUsePlugin")
            return None

        # Check if tool is in computer control domain using tool metadata
        tool = self.tool_registry.get_tool(tool_name)
        if not tool or tool.category != ToolDomain.COMPUTER:
            logger.debug(f"Tool {tool_name} is not a computer control tool, skipping screenshot")
            return None

        # Wait for UI to update
        await asyncio.sleep(self.screenshot_delay)

        # Execute screenshot tool using ToolExecutionEngine
        try:
            logger.debug(f"Capturing screenshot after {tool_name}")
            from backend.src.llm.parser import ParsedToolCall
            
            tool_call = ParsedToolCall(
                tool_name=SCREENSHOT_TOOL_NAME,
                parameters={
                    "explanation": f"Automatically capturing screenshot after {tool_name} execution to show the screen state.",
                    "expectation": f"Screenshot showing the screen state after {tool_name} was executed."
                },
                raw_call=f"{SCREENSHOT_TOOL_NAME}(explanation=..., expectation=...)",
                confidence=1.0,
            )
            
            execution_result = await self.execution_engine.execute(
                tool_call,
                user_id="system",
                session_id="system",
            )
            
            screenshot_data = self._extract_screenshot_data_from_result(execution_result)

            if not screenshot_data:
                logger.warning(
                    f"Failed to extract screenshot data after {tool_name}. "
                    f"Result keys: {list(execution_result.keys()) if isinstance(execution_result, dict) else 'N/A'}"
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

    def _extract_screenshot_data_from_result(self, execution_result: Any) -> Optional[str]:
        """
        Extract screenshot data from ToolExecutionResult.

        Args:
            execution_result: ToolExecutionResult from execute()

        Returns:
            Screenshot data string (base64) or None if not found/invalid
        """
        from backend.src.tools.execution.types import ToolExecutionResult
        
        if not isinstance(execution_result, ToolExecutionResult):
            logger.warning(f"Unexpected result type: {type(execution_result)}, expected ToolExecutionResult")
            return None

        # Check execution success
        if not execution_result.success:
            error = execution_result.result.error or "Unknown error"
            logger.warning(f"Screenshot tool execution failed: {error}")
            return None

        # Extract screenshot data from ToolResult
        tool_result = execution_result.result
        if tool_result.data and isinstance(tool_result.data, dict):
            screenshot_data = tool_result.data.get(SCREENSHOT_DATA_KEY)
        else:
            screenshot_data = None

        # Validate screenshot data
        if not screenshot_data:
            return None

        if not isinstance(screenshot_data, str):
            logger.warning(
                f"Invalid screenshot data type: {type(screenshot_data)}, expected str"
            )
            return None

        return screenshot_data
