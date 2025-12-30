"""
Plugin Initializer.

Handles plugin discovery, registration, and initialization.
"""
import logging
from pathlib import Path
from typing import Any

from backend.src.core.container import Container
from backend.src.core.plugins import (
    EntryPointPluginDiscoverer,
    FilesystemPluginDiscoverer,
    PluginDiscoveryService,
    PluginRegistry,
)

logger = logging.getLogger(__name__)


class PluginInitializer:
    """
    Initializes the plugin system.

    Handles plugin discovery, registration, and lifecycle management.
    """

    async def initialize(self, container: Container) -> PluginRegistry:
        """
        Initialize the plugin registry and discover/register plugins.

        Args:
            container: Application container

        Returns:
            Initialized PluginRegistry instance
        """
        # Define plugin directories to scan
        # Includes built-in plugins and external 'plugins' directory
        project_root = Path(__file__).parent.parent.parent.parent
        builtin_plugins_dir = Path(__file__).parent.parent.parent / "agent" / "plugins"
        external_plugins_dir = project_root / "plugins"

        plugin_dirs = [builtin_plugins_dir, external_plugins_dir]

        # Create plugin registry instance
        plugin_registry = PluginRegistry()

        # Inject container into registry for plugin dependencies
        plugin_registry.set_container(container)

        # Create discovery service
        discovery_service = PluginDiscoveryService(
            registry=plugin_registry,
            state_manager=plugin_registry.state_manager,
            config_manager=plugin_registry.config_manager,
        )

        # Register discoverers
        entry_point_discoverer = EntryPointPluginDiscoverer()
        discovery_service.register_discoverer(entry_point_discoverer)

        for plugin_dir in plugin_dirs:
            if plugin_dir.exists():
                filesystem_discoverer = FilesystemPluginDiscoverer(plugin_dir)
                discovery_service.register_discoverer(filesystem_discoverer)

        # Discover and register plugins (in-memory only, fast)
        await discovery_service.discover_and_register(auto_enable=True)
        logger.info(f"Registered {len(plugin_registry.get_enabled_plugins())} plugins")

        # Persist plugin configurations after all plugins are registered
        plugin_registry.save_config()
        logger.debug("Saved plugin configurations to disk")

        # Initialize all enabled plugins
        await plugin_registry.initialize_all_plugins()
        logger.info("Plugin registry initialized.")

        return plugin_registry
