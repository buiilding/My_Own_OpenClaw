"""
Plugin Lifecycle Management.

Handles initialization and shutdown of plugins.
"""
import inspect
import logging
from typing import TYPE_CHECKING, Set

from backend.src.agent.plugins.interface import AgentPlugin

if TYPE_CHECKING:
    from backend.src.core.plugins.registry import PluginRegistry

logger = logging.getLogger(__name__)


class PluginLifecycleManager:
    """
    Manages plugin lifecycle operations (initialization and shutdown).
    """

    def __init__(self, plugin_registry: "PluginRegistry"):
        """
        Initialize the lifecycle manager.

        Args:
            plugin_registry: PluginRegistry instance to manage
        """
        self.plugin_registry = plugin_registry
        self._initialized_plugins: Set[str] = set()

    async def initialize_plugin(self, plugin: AgentPlugin) -> bool:
        """
        Initialize a plugin (call its setup/init method if it exists).
        Injects container if available.

        Args:
            plugin: Plugin instance to initialize

        Returns:
            True if initialization succeeded, False otherwise
        """
        if hasattr(plugin, "initialize") and callable(plugin.initialize):
            try:
                if inspect.iscoroutinefunction(plugin.initialize):
                    # Check if it accepts arguments (like container)
                    sig = inspect.signature(plugin.initialize)
                    if (
                        "container" in sig.parameters
                        and hasattr(self.plugin_registry, "_container")
                        and self.plugin_registry._container
                    ):
                        await plugin.initialize(
                            container=self.plugin_registry._container
                        )
                    else:
                        await plugin.initialize()
                else:
                    # Sync initialize
                    plugin.initialize()

                self._initialized_plugins.add(plugin.name)
                logger.debug(f"Initialized plugin: {plugin.name}")
                return True
            except Exception as e:
                logger.error(
                    f"Failed to initialize plugin {plugin.name}: {e}", exc_info=True
                )
                return False
        return True

    async def shutdown_plugin(self, plugin: AgentPlugin) -> None:
        """
        Shutdown a plugin (call its cleanup method if it exists).

        Args:
            plugin: Plugin instance to shutdown
        """
        plugin_name = plugin.name

        if plugin_name not in self._initialized_plugins:
            return

        if hasattr(plugin, "shutdown") and callable(plugin.shutdown):
            try:
                if inspect.iscoroutinefunction(plugin.shutdown):
                    await plugin.shutdown()
                else:
                    plugin.shutdown()
                self._initialized_plugins.discard(plugin_name)
                logger.debug(f"Shutdown plugin: {plugin_name}")
            except Exception as e:
                logger.error(
                    f"Error shutting down plugin {plugin_name}: {e}", exc_info=True
                )

    async def initialize_all_plugins(self) -> int:
        """
        Initialize all enabled plugins.

        Returns:
            Number of plugins initialized
        """
        initialized_count = 0
        for plugin in self.plugin_registry.get_enabled_plugins():
            if await self.initialize_plugin(plugin):
                initialized_count += 1
        logger.info(f"Initialized {initialized_count} plugins")
        return initialized_count

    async def shutdown_all_plugins(self) -> None:
        """Shutdown all initialized plugins."""
        plugins_to_shutdown = list(self._initialized_plugins)
        for plugin_name in plugins_to_shutdown:
            plugin = self.plugin_registry.get_plugin(plugin_name)
            if plugin:
                await self.shutdown_plugin(plugin)
        logger.info("Shutdown all plugins")
