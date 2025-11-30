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
        
        # 1. Plugin Hooks (e.g. Computer Use, OCR)
        plugin_result = await self.plugin_manager.on_tool_end(
            tool_name, result
        )
        
        # Merge plugin artifacts into tool result
        if plugin_result and plugin_result.artifacts:
            if result.artifacts is None:
                result.artifacts = {}
            result.artifacts.update(plugin_result.artifacts)
            
            # Store OCR results in session for ClickOCRTool access
            if "ocr_results" in plugin_result.artifacts:
                # Initialize OCR cache if needed
                if not hasattr(self.session, "_ocr_results_cache"):
                    self.session._ocr_results_cache = {}
                # Store latest OCR results
                self.session._ocr_results_cache["latest"] = plugin_result.artifacts["ocr_results"]
                logger.debug(f"Stored {len(plugin_result.artifacts['ocr_results'])} OCR results in session cache")
        
        # Extract screenshot data (helper method to avoid nested checks)
        screenshot_data = self._extract_screenshot_data(result, plugin_result)

        # Construct the full tool message for both History and UI
        # This ensures the UI displays EXACTLY what the LLM sees in its history
        if result.success:
            # Use llm_content which may include OCR results from plugin
            content = result.llm_content or result.return_display or str(result.data or "No output")
            tool_message = f"TOOL EXECUTED SUCCESSFULLY: {tool_name}\n\n Tool Output:\n{content}"
        else:
            tool_message = f"TOOL FAILED: {tool_name}\n\n Tool Error: {result.error}"
        
        # Append screenshot text indicator if screenshot is present
        # This matches the system prompt format: "📸 State of the screen after..."
        if screenshot_data:
            tool_message += f"\n\n📸 State of the screen after {tool_name} was executed:"

        # Update history with the exact message
        self.session.history.add_tool_output(tool_message, screenshot_data)

        # Store Semantic Memories
        await self._process_tool_memories(result, tool_name)
        
        return {
            "tool_message": tool_message,
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
        # Check plugin artifacts first (ComputerUsePlugin provides screenshots here)
        if plugin_result and plugin_result.artifacts and "screenshot" in plugin_result.artifacts:
            return plugin_result.artifacts["screenshot"]
        
        # Check tool result artifacts
        if tool_result.artifacts and "screenshot" in tool_result.artifacts:
            return tool_result.artifacts["screenshot"]
        
        # Check tool result data dict (SDK tools often return it here)
        if isinstance(tool_result.data, dict) and "screenshot" in tool_result.data:
            return tool_result.data["screenshot"]
        
        return None

    async def _process_tool_memories(self, tool_result: ToolResult, tool_name: str):
        """Extracts and stores memories from tool results."""
        if tool_result.episodic_memories:
            for memory in tool_result.episodic_memories:
                memory_content = f"[Tool: {tool_name}] {memory.get('description', str(memory))}"
                if memory.get("context"):
                    memory_content += f" | Context: {memory['context']}"
                await self.session.memory_manager.store_episodic_memory(
                    f"Tool execution: {tool_name}", memory_content
                )
        
        if tool_result.semantic_facts:
            for fact in tool_result.semantic_facts:
                await self.session.memory_manager.memory_store.add(
                    text=fact.strip(),
                    user_id=self.session.memory_manager.user_id,
                    metadata={"type": "semantic", "source": f"tool_execution_{tool_name}", "tool_name": tool_name},
                )

