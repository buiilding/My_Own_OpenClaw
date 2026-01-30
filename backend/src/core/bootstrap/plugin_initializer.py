"""
Plugin Initializer.

Handles plugin discovery, registration, and initialization.
"""
import logging
import os
from pathlib import Path
from typing import Optional

from backend.src.core.container import Container
from backend.src.core.plugins import (
    EntryPointPluginDiscoverer,
    FilesystemPluginDiscoverer,
    PluginDiscoveryService,
    PluginRegistry,
)

logger = logging.getLogger(__name__)


class PluginInitializationError(Exception):
    """Raised when plugin initialization fails."""
    pass


class PluginInitializer:
    """
    Initializes the plugin system. 

    Handles plugin discovery, registration, and lifecycle management.
    """

    async def initialize(self, container: Optional[Container] = None) -> PluginRegistry:
        """
        Initialize the plugin registry and discover/register plugins.

        Args:
            container: Application container. Must not be None.

        Returns:
            Initialized PluginRegistry instance

        Raises:
            PluginInitializationError: If initialization fails at any step.
            ValueError: If container is None.
        """
        # Validate container parameter
        if container is None:
            raise ValueError("Container cannot be None for plugin initialization")

        try:
            # Get plugin directories to scan
            plugin_dirs = self._get_plugin_directories()

            # Create plugin registry instance with PluginConfigManager from container
            plugin_config_manager = self._get_plugin_config_manager(container)
            if plugin_config_manager is None:
                raise PluginInitializationError(
                    "Failed to obtain PluginConfigManager from container"
                )

            plugin_registry = PluginRegistry(plugin_config_manager=plugin_config_manager)
            if plugin_registry is None:
                raise PluginInitializationError("Failed to create PluginRegistry")

            # Inject container into registry for plugin dependencies
            plugin_registry.set_container(container)

            # Create and configure discovery service
            discovery_service = self._create_discovery_service(
                plugin_registry, plugin_dirs
            )

            # Check environment variable for auto-enable setting
            # Defaults to True for backward compatibility
            auto_enable_env = os.getenv("PLUGIN_AUTO_ENABLE", "true").lower()
            auto_enable = auto_enable_env in ("true", "1", "yes", "on")

            # Discover and register plugins
            discovered_count = await discovery_service.discover_and_register(
                auto_enable=auto_enable
            )
            if discovered_count < 0:
                raise PluginInitializationError(
                    "Plugin discovery returned invalid count"
                )

            enabled_plugins = plugin_registry.get_enabled_plugins()
            logger.info(
                f"Discovered {discovered_count} plugins, "
                f"{len(enabled_plugins)} enabled"
            )

            # Persist plugin configurations after all plugins are registered
            try:
                plugin_registry.save_config()
                logger.debug("Saved plugin configurations to disk")
            except Exception as e:
                logger.warning(
                    f"Failed to save plugin configurations: {e}. "
                    "Continuing with in-memory configuration."
                )

            # Initialize all enabled plugins
            initialized_count = await plugin_registry.initialize_all_plugins()
            if initialized_count < 0:
                raise PluginInitializationError(
                    "Plugin initialization returned invalid count"
                )

            logger.info(
                f"Plugin registry initialized. "
                f"{initialized_count} plugins initialized successfully."
            )

            # Validate final state
            self._validate_plugin_registry(plugin_registry)

            return plugin_registry

        except (ValueError, PluginInitializationError):
            # Re-raise our specific exceptions
            raise
        except Exception as e:
            raise PluginInitializationError(
                f"Unexpected error during plugin initialization: {str(e)}"
            ) from e

    def _get_plugin_directories(self) -> list[Path]:
        """
        Get list of plugin directories to scan.

        Returns:
            List of Path objects for plugin directories

        Raises:
            PluginInitializationError: If path calculation fails.
        """
        try:
            # Calculate paths relative to this file
            # This file is at: backend/src/core/bootstrap/plugin_initializer.py
            # Project root is: backend/
            # Built-in plugins: backend/src/agent/plugins/
            # External plugins: backend/plugins/ (or project_root/plugins/)
            current_file = Path(__file__).resolve()
            # Go up: bootstrap -> core -> src -> backend
            project_root = current_file.parent.parent.parent.parent
            builtin_plugins_dir = (
                current_file.parent.parent.parent / "agent" / "plugins"
            )
            external_plugins_dir = project_root / "plugins"

            plugin_dirs = []

            # Validate and add built-in plugins directory
            if builtin_plugins_dir.exists():
                if not builtin_plugins_dir.is_dir():
                    logger.warning(
                        f"Built-in plugins path exists but is not a directory: {builtin_plugins_dir}"
                    )
                else:
                    plugin_dirs.append(builtin_plugins_dir)
            else:
                logger.debug(f"Built-in plugins directory does not exist: {builtin_plugins_dir}")

            # Validate and add external plugins directory
            if external_plugins_dir.exists():
                if not external_plugins_dir.is_dir():
                    logger.warning(
                        f"External plugins path exists but is not a directory: {external_plugins_dir}"
                    )
                else:
                    plugin_dirs.append(external_plugins_dir)
            else:
                logger.debug(f"External plugins directory does not exist: {external_plugins_dir}")

            return plugin_dirs

        except Exception as e:
            raise PluginInitializationError(
                f"Failed to calculate plugin directories: {str(e)}"
            ) from e

    def _get_plugin_config_manager(self, container: Container):
        """
        Get PluginConfigManager from container.

        Args:
            container: Application container

        Returns:
            PluginConfigManager instance

        Raises:
            PluginInitializationError: If config manager cannot be obtained.
        """
        try:
            # Access via public API if available, otherwise use private attribute
            # Note: This is accessing _di_container which is a private attribute,
            # but there's no public API for this yet. This should be refactored
            # to use a public method on Container.
            if not hasattr(container, "_di_container"):
                raise PluginInitializationError(
                    "Container does not have _di_container attribute"
                )

            plugin_config_manager = container._di_container.core.plugin_config_manager()
            return plugin_config_manager

        except AttributeError as e:
            raise PluginInitializationError(
                f"Failed to access container DI container: {str(e)}"
            ) from e
        except Exception as e:
            raise PluginInitializationError(
                f"Failed to obtain PluginConfigManager: {str(e)}"
            ) from e

    def _create_discovery_service(
        self, plugin_registry: PluginRegistry, plugin_dirs: list[Path]
    ) -> PluginDiscoveryService:
        """
        Create and configure plugin discovery service.

        Args:
            plugin_registry: PluginRegistry instance
            plugin_dirs: List of plugin directories to scan

        Returns:
            Configured PluginDiscoveryService instance

        Raises:
            PluginInitializationError: If discovery service creation fails.
        """
        try:
            # Validate plugin_registry has required attributes
            if not hasattr(plugin_registry, "state_manager"):
                raise PluginInitializationError(
                    "PluginRegistry missing state_manager attribute"
                )
            if not hasattr(plugin_registry, "config_manager"):
                raise PluginInitializationError(
                    "PluginRegistry missing config_manager attribute"
                )

            # Create discovery service
            discovery_service = PluginDiscoveryService(
                registry=plugin_registry,
                state_manager=plugin_registry.state_manager,
                config_manager=plugin_registry.config_manager,
            )

            if discovery_service is None:
                raise PluginInitializationError("Failed to create PluginDiscoveryService")

            # Register entry point discoverer (always available)
            entry_point_discoverer = EntryPointPluginDiscoverer()
            discovery_service.register_discoverer(entry_point_discoverer)

            # Register filesystem discoverers for each valid directory
            for plugin_dir in plugin_dirs:
                try:
                    filesystem_discoverer = FilesystemPluginDiscoverer(plugin_dir)
                    discovery_service.register_discoverer(filesystem_discoverer)
                    logger.debug(f"Registered filesystem discoverer for: {plugin_dir}")
                except Exception as e:
                    logger.warning(
                        f"Failed to register filesystem discoverer for {plugin_dir}: {e}"
                    )

            return discovery_service

        except Exception as e:
            raise PluginInitializationError(
                f"Failed to create discovery service: {str(e)}"
            ) from e

    def _validate_plugin_registry(self, plugin_registry: PluginRegistry) -> None:
        """
        Validate that plugin registry is in a valid state.

        Args:
            plugin_registry: PluginRegistry instance to validate

        Raises:
            PluginInitializationError: If validation fails.
        """
        if plugin_registry is None:
            raise PluginInitializationError("PluginRegistry is None after initialization")

        # Validate required attributes exist
        required_attrs = ["state_manager", "config_manager", "lifecycle_manager"]
        for attr in required_attrs:
            if not hasattr(plugin_registry, attr):
                raise PluginInitializationError(
                    f"PluginRegistry missing required attribute: {attr}"
                )

        # Validate registry is functional (can get enabled plugins)
        try:
            enabled_plugins = plugin_registry.get_enabled_plugins()
            # It's OK to have zero plugins, but we should validate the method works
            logger.debug(f"Plugin registry validation passed. {len(enabled_plugins)} plugins enabled.")
        except Exception as e:
            raise PluginInitializationError(
                f"PluginRegistry validation failed: {str(e)}"
            ) from e
