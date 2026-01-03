"""
Result Processor.

This module handles the processing of tool execution results, including
artifact extraction, memory storage, and event publishing.
"""
import logging
from typing import TYPE_CHECKING, Any, Optional

from backend.src.core.interfaces.tool import ToolResult
from backend.src.agent.plugins.manager import PluginManager

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession

logger = logging.getLogger(__name__)


class ResultProcessor:
    """Processes tool execution results."""

    def __init__(self, session: "AgentSession", plugin_manager: PluginManager):
        self.session = session
        self.plugin_manager = plugin_manager

    async def process_results(
        self,
        tool_name: str,
        result: ToolResult
    ) -> dict:
        """
        Process the results of a tool execution.

        Args:
            tool_name: Name of the tool executed
            result: Result of the tool execution

        Returns:
            Dictionary containing processed output fields (tool_message, screenshot_data)
        """

        # 1. Plugin Hooks (plugins can process results, but screenshots come from frontend)
        plugin_result = await self.plugin_manager.on_tool_end(
            tool_name, result
        )
        
        # Merge plugin artifacts into tool result
        if plugin_result and plugin_result.artifacts:
            if result.artifacts is None:
                result.artifacts = {}
            result.artifacts.update(plugin_result.artifacts)
        
        # Extract screenshot data (helper method to avoid nested checks)
        screenshot_data = self._extract_screenshot_data(result, plugin_result)

        # 2. Handle System Context (Where and When)
        # We no longer call system_monitor here. 
        # The frontend sidecar is responsible for providing <os_state> XML.
        # It is already embedded in result.llm_content.
        
        screenshot_indicator = (
            f"State of the screen after {tool_name} was executed:"
            if screenshot_data
            else None
        )
        
        formatted_message = result.format_for_history(
            tool_name=tool_name,
            system_context=None, # Explicitly None, as context is now in llm_content
            screenshot_indicator=screenshot_indicator,
        )

        # Update history with the formatted message (includes active window)
        self.session.history.add_tool_output(formatted_message, screenshot_data)

        # Store Semantic Memories
        await self._process_tool_memories(result, tool_name)
        
        return {
            "tool_message": formatted_message,  # Return formatted message with active window
            "screenshot_data": screenshot_data
        }

    def _extract_screenshot_data(self, tool_result: ToolResult, plugin_result: Optional[Any]) -> Optional[str]:
        """
        Extract screenshot data from tool result or plugin artifacts.
        
        Args:
            tool_result: Tool execution result
            plugin_result: Optional plugin result with artifacts
            
        Returns:
            Base64 screenshot data or None
        """
        # Check plugin artifacts first (screenshots come from frontend, not plugins)
        if plugin_result and plugin_result.artifacts and "screenshot" in plugin_result.artifacts:
            logger.debug("Found screenshot in plugin artifacts")
            return plugin_result.artifacts["screenshot"]
        
        # Check tool result artifacts
        if tool_result.artifacts and "screenshot" in tool_result.artifacts:
            logger.debug("Found screenshot in tool result artifacts")
            return tool_result.artifacts["screenshot"]
        
        # Check tool result data dict (SDK tools often return it here, including frontend tools)
        if isinstance(tool_result.data, dict):
            if "screenshot" in tool_result.data:
                screenshot_data = tool_result.data["screenshot"]
                if screenshot_data and isinstance(screenshot_data, str):
                    logger.debug(f"Found screenshot in tool result data (length: {len(screenshot_data)})")
                    return screenshot_data
                else:
                    logger.warning(f"Screenshot data found but invalid type: {type(screenshot_data)}")
        
        # Debug logging for troubleshooting
        logger.debug(
            f"No screenshot found in tool result. "
            f"Data type: {type(tool_result.data)}, "
            f"Data keys: {list(tool_result.data.keys()) if isinstance(tool_result.data, dict) else 'N/A'}, "
            f"Artifacts: {list(tool_result.artifacts.keys()) if tool_result.artifacts else None}"
        )
        
        return None

    async def _process_tool_memories(self, tool_result: ToolResult, tool_name: str):
        """
        Extracts and stores memories from tool results.
        NOTE: In the new architecture, memory storage is handled by the frontend.
        The backend can still extract facts to return to the frontend if needed,
        but it does not store them locally.
        """
        # Memory storage is now handled by the frontend
        pass

