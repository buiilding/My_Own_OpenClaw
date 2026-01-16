"""
Plugin Discovery Service.

Coordinates plugin discovery and registration using PluginDiscoverer instances.
"""
import logging
from typing import List

from backend.src.core.plugin_config import PluginConfigManager
from backend.src.core.plugins.discovery import PluginDiscoverer
from backend.src.core.plugins.registry import PluginRegistry
from backend.src.core.plugins.state_manager import PluginStateManager

logger = logging.getLogger(__name__)


class PluginDiscoveryService:
    """
    Service for discovering and registering plugins.
    """

    def __init__(
        self,
        registry: PluginRegistry,
        state_manager: PluginStateManager,
        config_manager: PluginConfigManager,
    ):
        """
        Initialize the discovery service.

        Args:
            registry: PluginRegistry instance
            state_manager: PluginStateManager instance
            config_manager: PluginConfigManager instance
        """
        self.registry = registry
        self.state_manager = state_manager
        self.config_manager = config_manager
        self._discoverers: List[PluginDiscoverer] = []

    def register_discoverer(self, discoverer: PluginDiscoverer) -> None:
        """Register a plugin discovery mechanism."""
        if discoverer not in self._discoverers:
            self._discoverers.append(discoverer)
            logger.info(f"Registered plugin discoverer: {discoverer.get_source_name()}")

    async def discover_and_register(self, auto_enable: bool = True) -> int:
        """
        Discover plugins from all registered discoverers and register them.

        Args:
            auto_enable: Whether to enable plugins by default

        Returns:
            Number of plugins discovered and registered
        """
        discovered_count = 0

        for discoverer in self._discoverers:
            try:
                plugin_classes = await discoverer.discover()

                for plugin_class in plugin_classes:
                    try:
                        # Instantiate plugin (assumes no-arg constructor or handles default args)
                        plugin_instance = plugin_class()
                        plugin_name = getattr(
                            plugin_instance, "name", plugin_class.__name__
                        )

                        # Load config from config manager if available
                        saved_enabled = auto_enable
                        saved_priority = 100
                        saved_config = self.config_manager.get_plugin_config(
                            plugin_name
                        )
                        if saved_config:
                            saved_enabled = saved_config.get("enabled", auto_enable)
                            saved_priority = saved_config.get("priority", 100)

                        # Register plugin
                        self.registry.register(
                            plugin_instance,
                            enabled=saved_enabled,
                            priority=saved_priority,
                            metadata={
                                "source": discoverer.get_source_name(),
                                "module_path": f"{plugin_class.__module__}.{plugin_class.__name__}",
                            },
                        )
                        discovered_count += 1
                    except Exception as e:
                        logger.error(
                            f"Error registering discovered plugin {plugin_class.__name__}: {e}",
                            exc_info=True,
                        )
            except Exception as e:
                logger.error(
                    f"Error in discoverer {discoverer.get_source_name()}: {e}",
                    exc_info=True,
                )

        logger.info(f"Discovered and registered {discovered_count} plugins")
        return discovered_count
