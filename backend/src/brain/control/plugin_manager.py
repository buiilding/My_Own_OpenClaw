import logging
from typing import Any, Dict, List, Optional

from backend.src.brain.control.plugin_interface import AgentPlugin, PluginResult

logger = logging.getLogger(__name__)

class PluginManager:
    """
    Manages the lifecycle and execution of agent plugins.
    """

    def __init__(self):
        self.plugins: List[AgentPlugin] = []

    def register(self, plugin: AgentPlugin):
        """Register a new plugin."""
        self.plugins.append(plugin)
        logger.info(f"Registered plugin: {plugin.name}")

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        """Execute on_instruction hooks."""
        final_result = PluginResult()
        for plugin in self.plugins:
            if not hasattr(plugin, "on_instruction"): continue
            
            try:
                result = await plugin.on_instruction(instruction)
                if result:
                    if result.stop_execution:
                        return result
                    # TODO: Merge other fields if needed
            except Exception as e:
                logger.error(f"Error in plugin {plugin.name}.on_instruction: {e}")
        return None

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """Execute on_tool_end hooks."""
        final_artifacts = {}
        
        for plugin in self.plugins:
            if not hasattr(plugin, "on_tool_end"): continue
            
            try:
                plugin_result = await plugin.on_tool_end(tool_name, result)
                if plugin_result and plugin_result.artifacts:
                    final_artifacts.update(plugin_result.artifacts)
            except Exception as e:
                logger.error(f"Error in plugin {plugin.name}.on_tool_end: {e}")
                
        return PluginResult(artifacts=final_artifacts)

