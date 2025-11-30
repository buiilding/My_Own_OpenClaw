"""
Plugin State Management.

Handles plugin enable/disable state and metadata management.
"""
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class PluginStateManager:
    """
    Manages plugin state (enabled/disabled) and metadata.
    """

    def __init__(self):
        """Initialize the state manager."""
        self._plugin_metadata: Dict[str, Dict[str, Any]] = {}
        self._plugin_configs: Dict[str, Any] = {}  # PluginConfig instances
        self._enabled_plugins: List[str] = []

    def set_metadata(self, plugin_name: str, metadata: Dict[str, Any]) -> None:
        """Set metadata for a plugin."""
        self._plugin_metadata[plugin_name] = metadata

    def get_metadata(self, plugin_name: str) -> Optional[Dict[str, Any]]:
        """Get metadata for a plugin."""
        return self._plugin_metadata.get(plugin_name)

    def set_config(self, plugin_name: str, config: Any) -> None:
        """Set config for a plugin."""
        self._plugin_configs[plugin_name] = config

    def get_config(self, plugin_name: str) -> Optional[Any]:
        """Get config for a plugin."""
        return self._plugin_configs.get(plugin_name)

    def enable_plugin(self, plugin_name: str) -> bool:
        """
        Enable a plugin.

        Args:
            plugin_name: Name of the plugin to enable

        Returns:
            True if plugin was enabled, False if already enabled or plugin doesn't exist
        """
        if plugin_name not in self._plugin_metadata:
            logger.warning(f"Cannot enable unknown plugin: {plugin_name}")
            return False

        if plugin_name not in self._enabled_plugins:
            self._enabled_plugins.append(plugin_name)
            self._plugin_metadata[plugin_name]["enabled"] = True
            if plugin_name in self._plugin_configs:
                self._plugin_configs[plugin_name].enabled = True
            logger.info(f"Enabled plugin: {plugin_name}")
            return True
        return False

    def disable_plugin(self, plugin_name: str) -> bool:
        """
        Disable a plugin.

        Args:
            plugin_name: Name of the plugin to disable

        Returns:
            True if plugin was disabled, False if already disabled or plugin doesn't exist
        """
        if plugin_name in self._enabled_plugins:
            self._enabled_plugins.remove(plugin_name)
            self._plugin_metadata[plugin_name]["enabled"] = False
            if plugin_name in self._plugin_configs:
                self._plugin_configs[plugin_name].enabled = False
            logger.info(f"Disabled plugin: {plugin_name}")
            return True
        return False

    def is_enabled(self, plugin_name: str) -> bool:
        """Check if a plugin is enabled."""
        return plugin_name in self._enabled_plugins

    def get_enabled_plugin_names(self) -> List[str]:
        """Get list of enabled plugin names."""
        return list(self._enabled_plugins)

    def remove_plugin(self, plugin_name: str) -> None:
        """Remove a plugin from state management."""
        if plugin_name in self._plugin_metadata:
            del self._plugin_metadata[plugin_name]
        if plugin_name in self._plugin_configs:
            del self._plugin_configs[plugin_name]
        if plugin_name in self._enabled_plugins:
            self._enabled_plugins.remove(plugin_name)
