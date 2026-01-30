"""
Plugin Configuration Management.

This module provides configuration management for plugins, including
loading plugin configs from Python config files.
Configuration is loaded from backend.src.core.plugins.plugin_config module.
"""
import importlib
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


class PluginConfigManager:
    """
    Manages plugin configuration loaded from Python config file.
    
    Plugin enable/disable states, priorities, and custom configs are loaded
    from backend.src.core.plugins.plugin_config.PLUGIN_CONFIG.
    To change configuration, edit that file and restart the application.
    """
    
    def __init__(self, config_file: Any = None):
        """
        Initialize the plugin config manager.
        
        Args:
            config_file: Ignored (kept for backward compatibility)
        """
        self._config: Dict[str, Dict[str, Any]] = {}
        self._load_config()
    
    def _load_config(self, reload_module: bool = False) -> None:
        """
        Load configuration from Python config file.
        
        Args:
            reload_module: If True, reload the config module to pick up changes.
                          Only use this when explicitly reloading config.
        """
        try:
            # Import the config module to get the PLUGIN_CONFIG
            from backend.src.core.plugins import plugin_config as config_module
            
            # Reload module only if explicitly requested
            if reload_module:
                try:
                    importlib.reload(config_module)
                    logger.debug("Plugin config module reloaded")
                except Exception as reload_error:
                    logger.warning(
                        f"Failed to reload plugin config module (may not be loaded yet): {reload_error}"
                    )
                    # Continue with current module state
            
            self._config = config_module.PLUGIN_CONFIG.copy()
            logger.debug("Loaded plugin config from Python config file")
        except ImportError as e:
            logger.error(f"Failed to import plugin config module: {e}", exc_info=True)
            self._config = {}
        except Exception as e:
            logger.error(f"Error loading plugin config: {e}", exc_info=True)
            self._config = {}
    
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
        enabled: Any = None,
        priority: Any = None,
        config: Any = None,
    ) -> None:
        """
        Set configuration for a plugin (runtime only, not persisted).
        
        WARNING: Changes are not persisted. To make permanent changes, edit
        backend.src.core.plugins.plugin_config and restart the application.
        
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
        
        logger.debug(f"Plugin config updated in memory for {plugin_name} (not persisted)")
    
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
        Remove configuration for a plugin (runtime only, not persisted).
        
        WARNING: Changes are not persisted. To make permanent changes, edit
        backend.src.core.plugins.plugin_config and restart the application.
        
        Args:
            plugin_name: Name of the plugin
        """
        if plugin_name in self._config:
            del self._config[plugin_name]
            logger.debug(f"Plugin config removed from memory for {plugin_name} (not persisted)")
    
    def update_plugin_config(self, plugin_name: str, config: Dict[str, Any]) -> None:
        """
        Update configuration for a plugin (runtime only, not persisted).
        
        WARNING: Changes are not persisted. To make permanent changes, edit
        backend.src.core.plugins.plugin_config and restart the application.
        
        Args:
            plugin_name: Name of the plugin
            config: Configuration dictionary to merge
        """
        if plugin_name not in self._config:
            self._config[plugin_name] = {}
        
        self._config[plugin_name].update(config)
        logger.debug(f"Plugin config updated in memory for {plugin_name} (not persisted)")
    
    def reload_config(self) -> None:
        """
        Reload plugin configuration from Python config file.
        
        Note: This will reload the Python config module to pick up file changes.
        Changes to plugin_config.py will be reflected after calling this method.
        """
        self._load_config(reload_module=True)
        logger.info("Plugin configuration reloaded from Python config file")
    
    def get_all_configs(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all plugin configurations.
        
        Returns:
            Dictionary mapping plugin names to their configs
        """
        return self._config.copy()



