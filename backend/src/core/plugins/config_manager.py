"""
Plugin Configuration Management.

Handles plugin configuration persistence via PluginConfigManager.
"""
import logging
from typing import Any, Dict, Optional

from backend.src.core.plugin_config import get_plugin_config_manager

logger = logging.getLogger(__name__)


class PluginConfigManager:
    """
    Manages plugin configuration persistence.
    """

    def __init__(self, use_config_manager: bool = True):
        """
        Initialize the config manager.

        Args:
            use_config_manager: If True, use PluginConfigManager for persistence
        """
        self._config_manager = (
            get_plugin_config_manager() if use_config_manager else None
        )

    def save_plugin_config(
        self,
        plugin_name: str,
        enabled: Optional[bool] = None,
        priority: Optional[int] = None,
    ) -> None:
        """
        Save plugin configuration.

        Args:
            plugin_name: Name of the plugin
            enabled: Whether plugin is enabled
            priority: Plugin priority
        """
        if not self._config_manager:
            return

        try:
            self._config_manager.set_plugin_config(
                plugin_name,
                enabled=enabled,
                priority=priority,
            )
        except Exception as e:
            logger.error(
                f"Failed to save config for plugin {plugin_name}: {e}", exc_info=True
            )

    def load_plugin_config(self, plugin_name: str) -> Optional[Dict[str, Any]]:
        """
        Load plugin configuration.

        Args:
            plugin_name: Name of the plugin

        Returns:
            Configuration dictionary or None if not found
        """
        if not self._config_manager:
            return None

        try:
            return self._config_manager.get_plugin_config(plugin_name)
        except Exception as e:
            logger.error(
                f"Failed to load config for plugin {plugin_name}: {e}", exc_info=True
            )
            return None
