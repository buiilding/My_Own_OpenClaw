"""
Unified Configuration Service.

This module provides a single source of truth for all configuration access,
consolidating AppConfig, PluginConfig, and runtime configuration.
"""
import logging
from typing import Any, Dict, Optional

from backend.src.core.config import AppConfig, ConfigManager, get_config_manager
from backend.src.core.config_service import ConfigurationService
from backend.src.core.config_subscription_manager import ConfigSubscriber
from backend.src.core.plugin_config import (
    PluginConfigManager,
    get_plugin_config_manager,
)

logger = logging.getLogger(__name__)


class UnifiedConfigurationService:
    """
    Unified configuration service that consolidates all configuration access.

    Provides a single interface for:
    - Application configuration (AppConfig)
    - Plugin configuration (PluginConfigManager)
    - Runtime configuration overrides
    """

    def __init__(
        self,
        config_manager: Optional[ConfigManager] = None,
        plugin_config_manager: Optional[PluginConfigManager] = None,
    ):
        """
        Initialize the unified configuration service.

        Args:
            config_manager: Optional ConfigManager instance (created if not provided)
            plugin_config_manager: Optional PluginConfigManager instance (created if not provided)
        """
        self._config_manager = config_manager or get_config_manager()
        self._plugin_config_manager = (
            plugin_config_manager or get_plugin_config_manager()
        )

        # Wrap ConfigManager with ConfigurationService for change notifications
        self._config_service = ConfigurationService(self._config_manager)
        self._initialized = False

    def initialize(self) -> AppConfig:
        """
        Initialize the configuration service.

        Returns:
            Loaded AppConfig instance
        """
        if not self._initialized:
            self._config_service.initialize()
            self._initialized = True
            logger.info("UnifiedConfigurationService initialized")
        return self._config_service.get_config()

    def get_app_config(self) -> AppConfig:
        """
        Get application configuration.

        Returns:
            Current AppConfig instance
        """
        return self._config_service.get_config()

    def update_app_config(self, new_config: AppConfig) -> AppConfig:
        """
        Update application configuration.

        Args:
            new_config: New configuration instance

        Returns:
            Updated configuration
        """
        return self._config_service.update_config(new_config)

    def get_plugin_config(self, plugin_name: str) -> Dict[str, Any]:
        """
        Get configuration for a specific plugin.

        Args:
            plugin_name: Name of the plugin

        Returns:
            Plugin configuration dictionary
        """
        return self._plugin_config_manager.get_plugin_config(plugin_name)

    def update_plugin_config(self, plugin_name: str, config: Dict[str, Any]) -> None:
        """
        Update configuration for a specific plugin.

        Args:
            plugin_name: Name of the plugin
            config: Configuration dictionary
        """
        self._plugin_config_manager.update_plugin_config(plugin_name, config)

    def subscribe(self, subscriber: ConfigSubscriber) -> None:
        """
        Subscribe to application configuration changes.

        Args:
            subscriber: Object implementing ConfigSubscriber protocol
        """
        self._config_service.subscribe(subscriber)

    def get_config(self) -> AppConfig:
        """
        Get application configuration (convenience method).

        Returns:
            Current AppConfig instance
        """
        return self.get_app_config()

    @property
    def config(self) -> AppConfig:
        """
        Get application configuration (property access).

        Returns:
            Current AppConfig instance
        """
        return self.get_app_config()

    @property
    def config_service(self) -> ConfigurationService:
        """
        Get the underlying ConfigurationService (for advanced usage).

        Returns:
            ConfigurationService instance
        """
        return self._config_service


# Global unified config service instance
_unified_config_service: Optional[UnifiedConfigurationService] = None


def get_unified_config_service() -> UnifiedConfigurationService:
    """
    Get the global unified configuration service instance.

    Returns:
        UnifiedConfigurationService instance
    """
    global _unified_config_service
    if _unified_config_service is None:
        _unified_config_service = UnifiedConfigurationService()
    return _unified_config_service


def initialize_unified_config_service() -> UnifiedConfigurationService:
    """
    Initialize the global unified configuration service.

    Returns:
        Initialized UnifiedConfigurationService instance
    """
    service = get_unified_config_service()
    service.initialize()
    return service
