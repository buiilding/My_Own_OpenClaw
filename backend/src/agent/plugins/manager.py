"""
Plugin Manager for Agent Execution.

This module provides the PluginManager class that orchestrates plugin execution
during agent operations. It integrates with the PluginRegistry for plugin discovery
and lifecycle management. Enhanced with Phase 3 features including automatic discovery
and lifecycle management.
"""
import logging
from typing import Any, Dict, List, Optional

from backend.src.agent.plugins.interface import AgentPlugin, PluginResult
from backend.src.core.plugins import plugin_registry

logger = logging.getLogger(__name__)


class PluginManager:
    """
    Manages the lifecycle and execution of agent plugins during agent operations.
    
    Integrates with the global PluginRegistry to get enabled plugins and
    executes their hooks in priority order.
    """

    def __init__(self, use_registry: bool = True):
        """
        Initialize the plugin manager.
        
        Args:
            use_registry: If True, use the global plugin registry. If False,
                         maintain a local list (for backward compatibility)
        """
        self.use_registry = use_registry
        if not use_registry:
            # Backward compatibility: maintain local plugin list
            self.plugins: List[AgentPlugin] = []

    def register(self, plugin: AgentPlugin, priority: int = 100) -> None:
        """
        Register a plugin.
        
        Args:
            plugin: The plugin instance to register
            priority: Execution priority (lower = higher priority)
        """
        if self.use_registry:
            plugin_registry.register(plugin, enabled=True, priority=priority)
        else:
            self.plugins.append(plugin)
            logger.info(f"Registered plugin: {plugin.name}")

    def _get_plugins(self) -> List[AgentPlugin]:
        """Get the list of plugins to execute."""
        if self.use_registry:
            return plugin_registry.get_enabled_plugins()
        return self.plugins

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        """
        Execute on_instruction hooks for all enabled plugins.
        
        Args:
            instruction: The user's instruction/query
            
        Returns:
            PluginResult if a plugin requests execution stop, None otherwise
        """
        final_result = PluginResult()
        
        for plugin in self._get_plugins():
            if not hasattr(plugin, "on_instruction"):
                continue
            
            try:
                result = await plugin.on_instruction(instruction)
                if result:
                    # Merge content if provided
                    if result.content:
                        final_result.content = (
                            (final_result.content or "") + "\n" + result.content
                        ).strip()
                    
                    # Stop execution if requested
                    if result.stop_execution:
                        logger.info(f"Plugin {plugin.name} requested execution stop")
                        return result
                    
                    # Merge artifacts
                    if result.artifacts:
                        if not final_result.artifacts:
                            final_result.artifacts = {}
                        final_result.artifacts.update(result.artifacts)
            
            except Exception as e:
                logger.error(
                    f"Error in plugin {plugin.name}.on_instruction: {e}",
                    exc_info=True
                )
        
        return final_result if final_result.content or final_result.artifacts else None

    async def on_llm_response(self, response_text: str) -> Optional[PluginResult]:
        """
        Execute on_llm_response hooks for all enabled plugins.
        
        Args:
            response_text: The LLM's response text
            
        Returns:
            PluginResult if plugins modify the response, None otherwise
        """
        final_result = PluginResult()
        
        for plugin in self._get_plugins():
            if not hasattr(plugin, "on_llm_response"):
                continue
            
            try:
                result = await plugin.on_llm_response(response_text)
                if result:
                    # Merge content (plugins can modify response)
                    if result.content:
                        final_result.content = result.content
                    
                    if result.stop_execution:
                        return result
                    
                    if result.artifacts:
                        if not final_result.artifacts:
                            final_result.artifacts = {}
                        final_result.artifacts.update(result.artifacts)
            
            except Exception as e:
                logger.error(
                    f"Error in plugin {plugin.name}.on_llm_response: {e}",
                    exc_info=True
                )
        
        return final_result if final_result.content or final_result.artifacts else None

    async def on_tool_start(
        self, tool_name: str, args: Dict[str, Any]
    ) -> Optional[PluginResult]:
        """
        Execute on_tool_start hooks for all enabled plugins.
        
        Args:
            tool_name: Name of the tool being executed
            args: Arguments passed to the tool
            
        Returns:
            PluginResult if a plugin requests execution stop, None otherwise
        """
        for plugin in self._get_plugins():
            if not hasattr(plugin, "on_tool_start"):
                continue
            
            try:
                result = await plugin.on_tool_start(tool_name, args)
                if result and result.stop_execution:
                    logger.info(f"Plugin {plugin.name} requested tool execution stop")
                    return result
            
            except Exception as e:
                logger.error(
                    f"Error in plugin {plugin.name}.on_tool_start: {e}",
                    exc_info=True
                )
        
        return None

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
                    f"Error in plugin {plugin.name}.on_tool_end: {e}",
                    exc_info=True
                )
        
        return PluginResult(artifacts=final_artifacts) if final_artifacts else None
    
    # Phase 3: Enhanced lifecycle methods
    
    async def initialize_all(self) -> int:
        """
        Initialize all enabled plugins.
        
        Returns:
            Number of plugins initialized
        """
        if self.use_registry:
            return await plugin_registry.initialize_all_plugins()
        return 0
    
    async def shutdown_all(self) -> None:
        """Shutdown all plugins."""
        if self.use_registry:
            await plugin_registry.shutdown_all_plugins()

