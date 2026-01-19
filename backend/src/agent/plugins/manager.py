"""
Plugin Manager for Agent Execution.

This module provides the PluginManager class that orchestrates plugin execution
during agent operations. It integrates with the PluginRegistry for plugin discovery
and lifecycle management.
"""
import asyncio
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
        
        SERIAL PLUGIN EXECUTION FIX: Executes plugins in parallel using asyncio.gather
        to reduce latency from Sum(plugin_latency) to Max(plugin_latency). This is safe
        because plugin hooks are independent and don't share mutable state.

        Args:
            tool_name: Name of the tool that finished executing
            result: The tool's execution result

        Returns:
            PluginResult with merged artifacts from all plugins
        """
        plugins = [p for p in self._get_plugins() if hasattr(p, "on_tool_end")]
        
        if not plugins:
            return None
        
        # SERIAL PLUGIN EXECUTION FIX: Execute all plugins in parallel
        # This reduces latency from Sum(plugin_latency) to Max(plugin_latency)
        # Plugins are independent and don't share mutable state, so parallel execution is safe
        async def execute_plugin(plugin: AgentPlugin) -> Optional[PluginResult]:
            """Execute a single plugin hook with error handling."""
            try:
                return await plugin.on_tool_end(tool_name, result)
            except Exception as e:
                logger.error(
                    f"Error in plugin {plugin.name}.on_tool_end: {e}", exc_info=True
                )
                return None
        
        # Execute all plugins in parallel
        plugin_results = await asyncio.gather(
            *[execute_plugin(plugin) for plugin in plugins],
            return_exceptions=False  # Exceptions are handled in execute_plugin
        )
        
        # Merge artifacts from all plugins
        final_artifacts = {}
        for plugin_result in plugin_results:
            if plugin_result and plugin_result.artifacts:
                final_artifacts.update(plugin_result.artifacts)

        return PluginResult(artifacts=final_artifacts) if final_artifacts else None
