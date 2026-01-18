"""
Plugin Manager for Agent Execution.

This module provides the PluginManager class that orchestrates plugin execution
during agent operations. It integrates with the PluginRegistry for plugin discovery
and lifecycle management.
"""
import logging
from typing import Any, Dict, List, Optional

from backend.src.agent.plugins.interface import AgentPlugin, PluginResult
from backend.src.core.plugins.registry import PluginRegistry

logger = logging.getLogger(__name__)


class PluginManager:
    """
    Manages the lifecycle and execution of agent plugins during agent operations.

    Integrates with PluginRegistry to get enabled plugins and
    executes their hooks in priority order.
    """

    def __init__(self, plugin_registry: PluginRegistry):
        """
        Initialize the plugin manager.

        Args:
            plugin_registry: PluginRegistry instance to use
        """
        self.plugin_registry = plugin_registry

    def register(self, plugin: AgentPlugin, priority: int = 100) -> None:
        """
        Register a plugin.

        Args:
            plugin: The plugin instance to register
            priority: Execution priority (lower = higher priority)
        """
        self.plugin_registry.register(plugin, enabled=True, priority=priority)

    def _get_plugins(self) -> List[AgentPlugin]:
        """Get the list of plugins to execute."""
        return self.plugin_registry.get_enabled_plugins()

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """
        Execute on_tool_end hooks for all enabled plugins.

        Args:
            tool_name: Name of the tool that finished executing
            result: The tool's execution result

        Returns:
            PluginResult with merged artifacts from all plugins
        """
        final_artifacts = {}

        for plugin in self._get_plugins():
            if not hasattr(plugin, "on_tool_end"):
                continue

            try:
                plugin_result = await plugin.on_tool_end(tool_name, result)
                if plugin_result and plugin_result.artifacts:
                    final_artifacts.update(plugin_result.artifacts)

            except Exception as e:
                logger.error(
                    f"Error in plugin {plugin.name}.on_tool_end: {e}", exc_info=True
                )

        return PluginResult(artifacts=final_artifacts) if final_artifacts else None
