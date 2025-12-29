"""
Unified Configuration Service (DEPRECATED).

This module is deprecated. Use ConfigurationService directly instead.
ConfigurationService now includes all functionality that UnifiedConfigurationService provided.

This module is kept for backward compatibility during migration.
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
    DEPRECATED: Use ConfigurationService directly instead.
    
    UnifiedConfigurationService functionality has been merged into ConfigurationService.
    This class is kept for backward compatibility and delegates to ConfigurationService.
    """

    def __init__(
        self,
        config_manager: Optional[ConfigManager] = None,
        plugin_config_manager: Optional[PluginConfigManager] = None,
    ):
        """
        Initialize the unified configuration service (DEPRECATED).

        Args:
            config_manager: Optional ConfigManager instance (created if not provided)
            plugin_config_manager: Optional PluginConfigManager instance (created if not provided)
        """
        logger.warning(
            "UnifiedConfigurationService is deprecated. Use ConfigurationService directly."
        )
        self._config_manager = config_manager or get_config_manager()

        # Use ConfigurationService which now includes plugin config
        self._config_service = ConfigurationService(
            self._config_manager, plugin_config_manager=plugin_config_manager
        )
        self._initialized = False

    def initialize(self) -> AppConfig:
        """Initialize the configuration service."""
        if not self._initialized:
            self._config_service.initialize()
            self._initialized = True
            logger.info("UnifiedConfigurationService initialized (deprecated)")
        return self._config_service.get_config()

    def get_app_config(self) -> AppConfig:
        """Get application configuration."""
        return self._config_service.get_config()

    def update_app_config(self, new_config: AppConfig) -> AppConfig:
        """Update application configuration."""
        return self._config_service.update_config(new_config)

    def get_plugin_config(self, plugin_name: str) -> Dict[str, Any]:
        """Get configuration for a specific plugin."""
        return self._config_service.get_plugin_config(plugin_name)

    def update_plugin_config(self, plugin_name: str, config: Dict[str, Any]) -> None:
        """Update configuration for a specific plugin."""
        self._config_service.update_plugin_config(plugin_name, config)

    def subscribe(self, subscriber: ConfigSubscriber) -> None:
        """Subscribe to application configuration changes."""
        self._config_service.subscribe(subscriber)

    def get_config(self) -> AppConfig:
        """Get application configuration (convenience method)."""
        return self.get_app_config()

    @property
    def config(self) -> AppConfig:
        """Get application configuration (property access)."""
        return self.get_app_config()

    @property
    def config_service(self) -> ConfigurationService:
        """Get the underlying ConfigurationService."""
        return self._config_service


# DEPRECATED: Use ConfigurationService directly
_unified_config_service: Optional[UnifiedConfigurationService] = None


def get_unified_config_service() -> UnifiedConfigurationService:
    """
    DEPRECATED: Use ConfigurationService directly.
    
    Get the global unified configuration service instance.
    """
    global _unified_config_service
    if _unified_config_service is None:
        _unified_config_service = UnifiedConfigurationService()
    return _unified_config_service


def initialize_unified_config_service() -> UnifiedConfigurationService:
    """
    DEPRECATED: Use ConfigurationService directly.
    
    Initialize the global unified configuration service.
    """
    service = get_unified_config_service()
    service.initialize()
    return service
