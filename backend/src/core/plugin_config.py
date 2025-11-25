"""
Plugin Configuration Management.

This module provides configuration management for plugins, including
loading/saving plugin configs and managing plugin enable/disable states.
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

from backend.src.core.config import get_config_dir

logger = logging.getLogger(__name__)

PLUGIN_CONFIG_FILE = "plugin_config.json"


class PluginConfigManager:
    """
    Manages plugin configuration persistence.
    
    Stores plugin enable/disable states, priorities, and custom config
    in a JSON file in the config directory.
    """
    
    def __init__(self, config_file: Optional[Path] = None):
        """
        Initialize the plugin config manager.
        
        Args:
            config_file: Optional path to config file (defaults to config_dir/plugin_config.json)
        """
        if config_file is None:
            config_dir = get_config_dir()
            config_dir.mkdir(parents=True, exist_ok=True)
            config_file = config_dir / PLUGIN_CONFIG_FILE
        
        self.config_file = config_file
        self._config: Dict[str, Dict[str, Any]] = {}
        self._load_config()
    
    def _load_config(self) -> None:
        """Load configuration from file."""
        if self.config_file.exists():
            try:
                with open(self.config_file, "r", encoding="utf-8") as f:
                    self._config = json.load(f)
                logger.debug(f"Loaded plugin config from {self.config_file}")
            except Exception as e:
                logger.error(f"Error loading plugin config: {e}", exc_info=True)
                self._config = {}
        else:
            self._config = {}
    
    def _save_config(self) -> None:
        """Save configuration to file."""
        try:
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(self._config, f, indent=2)
            logger.debug(f"Saved plugin config to {self.config_file}")
        except Exception as e:
            logger.error(f"Error saving plugin config: {e}", exc_info=True)
    
    def get_plugin_config(self, plugin_name: str) -> Dict[str, Any]:
        """
        Get configuration for a plugin.
        
        Args:
            plugin_name: Name of the plugin
            
        Returns:
            Plugin configuration dictionary
        """
        return self._config.get(plugin_name, {})
    
    def set_plugin_config(
        self,
        plugin_name: str,
        enabled: Optional[bool] = None,
        priority: Optional[int] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Set configuration for a plugin.
        
        Args:
            plugin_name: Name of the plugin
            enabled: Enable/disable state
            priority: Execution priority
            config: Custom configuration dictionary
        """
        if plugin_name not in self._config:
            self._config[plugin_name] = {}
        
        if enabled is not None:
            self._config[plugin_name]["enabled"] = enabled
        
        if priority is not None:
            self._config[plugin_name]["priority"] = priority
        
        if config is not None:
            if "config" not in self._config[plugin_name]:
                self._config[plugin_name]["config"] = {}
            self._config[plugin_name]["config"].update(config)
        
        self._save_config()
    
    def is_enabled(self, plugin_name: str) -> bool:
        """
        Check if a plugin is enabled.
        
        Args:
            plugin_name: Name of the plugin
            
        Returns:
            True if enabled, False otherwise (defaults to True if not configured)
        """
        return self._config.get(plugin_name, {}).get("enabled", True)
    
    def get_priority(self, plugin_name: str, default: int = 100) -> int:
        """
        Get priority for a plugin.
        
        Args:
            plugin_name: Name of the plugin
            default: Default priority if not configured
            
        Returns:
            Plugin priority
        """
        return self._config.get(plugin_name, {}).get("priority", default)
    
    def get_custom_config(self, plugin_name: str) -> Dict[str, Any]:
        """
        Get custom configuration for a plugin.
        
        Args:
            plugin_name: Name of the plugin
            
        Returns:
            Custom configuration dictionary
        """
        return self._config.get(plugin_name, {}).get("config", {})
    
    def remove_plugin_config(self, plugin_name: str) -> None:
        """
        Remove configuration for a plugin.
        
        Args:
            plugin_name: Name of the plugin
        """
        if plugin_name in self._config:
            del self._config[plugin_name]
            self._save_config()
    
    def get_all_configs(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all plugin configurations.
        
        Returns:
            Dictionary mapping plugin names to their configs
        """
        return self._config.copy()


# Global plugin config manager instance
_plugin_config_manager: Optional[PluginConfigManager] = None


def get_plugin_config_manager() -> PluginConfigManager:
    """
    Get the global plugin config manager instance.
    
    Returns:
        PluginConfigManager instance
    """
    global _plugin_config_manager
    if _plugin_config_manager is None:
        _plugin_config_manager = PluginConfigManager()
    return _plugin_config_manager

