"""
Plugin System Bridge for Backward Compatibility.

This module provides a bridge between the old and new plugin systems,
allowing gradual migration while maintaining backward compatibility.
"""
import logging
from typing import List

from backend.src.agent.plugins.interface import AgentPlugin
from backend.src.core.plugins import plugin_registry as old_registry
from backend.src.core.plugins import get_enhanced_plugin_registry

logger = logging.getLogger(__name__)


class PluginSystemBridge:
    """
    Bridge between old and new plugin systems.
    
    Allows both systems to coexist and provides unified access.
    """
    
    def __init__(self):
        """Initialize the bridge."""
        self.old_registry = old_registry
        self.new_registry = get_enhanced_plugin_registry()
    
    def get_all_plugins(self) -> List[AgentPlugin]:
        """
        Get all plugins from both registries.
        
        Returns:
            List of all enabled plugins (new registry takes precedence)
        """
        # Get plugins from new registry (higher priority)
        new_plugins = self.new_registry.get_enabled_plugins()
        
        # Get plugins from old registry (for backward compatibility)
        old_plugins = self.old_registry.get_enabled_plugins()
        
        # Merge, avoiding duplicates (new registry wins)
        new_plugin_names = {p.name for p in new_plugins}
        old_plugins_filtered = [
            p for p in old_plugins if p.name not in new_plugin_names
        ]
        
        # Combine and sort by priority
        all_plugins = new_plugins + old_plugins_filtered
        
        # Sort by priority (would need to get priorities from both registries)
        # For now, new plugins come first
        return all_plugins
    
    def register_legacy(self, plugin: AgentPlugin, priority: int = 100) -> None:
        """
        Register plugin in legacy registry (for backward compatibility).
        
        Args:
            plugin: Plugin instance
            priority: Execution priority
        """
        self.old_registry.register(plugin, enabled=True, priority=priority)
        logger.debug(f"Registered plugin {plugin.name} in legacy registry")
    
    def register_enhanced(self, plugin: AgentPlugin, priority: int = 100) -> None:
        """
        Register plugin in enhanced registry.
        
        Args:
            plugin: Plugin instance
            priority: Execution priority
        """
        self.new_registry.register(plugin, enabled=True, priority=priority)
        logger.debug(f"Registered plugin {plugin.name} in enhanced registry")


# Global bridge instance
_plugin_bridge: PluginSystemBridge = None


def get_plugin_bridge() -> PluginSystemBridge:
    """
    Get the global plugin bridge instance.
    
    Returns:
        PluginSystemBridge instance
    """
    global _plugin_bridge
    if _plugin_bridge is None:
        _plugin_bridge = PluginSystemBridge()
    return _plugin_bridge

