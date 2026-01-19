"""
Plugin Registry for the Desktop Assistant.

Centralized registry for managing agent plugins with registration and retrieval.
"""
import logging
import threading
from typing import Any, Dict, List, Optional, TypeVar

from backend.src.agent.plugins.interface import AgentPlugin
from backend.src.core.plugins.config import PluginConfigManager
from backend.src.core.plugins.lifecycle import PluginLifecycleManager
from backend.src.core.plugins.metadata import PluginConfig
from backend.src.core.plugins.state_manager import PluginStateManager

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=AgentPlugin)


class PluginRegistry:
    """
    Centralized registry for managing agent plugins.

    Provides plugin registration and retrieval. State management, configuration,
    and discovery are handled by separate services.
    
    THREAD SAFETY: All access to _plugins dictionary is protected by _lock
    to prevent RuntimeError: dictionary changed size during iteration when
    plugins are dynamically loaded/unloaded at runtime.
    """

    def __init__(
        self,
        plugin_config_manager: PluginConfigManager = None,
        use_config_manager: bool = True,
    ):
        """
        Initialize the plugin registry.

        Args:
            plugin_config_manager: Optional PluginConfigManager instance (created if None and use_config_manager is True)
            use_config_manager: If True, use PluginConfigManager for persistence
        """
        self._plugins: Dict[str, AgentPlugin] = {}
        self._lock = threading.RLock()  # Reentrant lock for thread safety
        self._container = None

        # Initialize managers
        self.state_manager = PluginStateManager()
        if use_config_manager:
            if plugin_config_manager is None:
                # Fallback: create new instance (should be provided via DI)
                plugin_config_manager = PluginConfigManager()
            self.config_manager = plugin_config_manager
        else:
            self.config_manager = None
        self.lifecycle_manager = PluginLifecycleManager(self)

    def set_container(self, container: Any) -> None:
        """Set the DI container for plugin dependency injection."""
        self._container = container

    def register(
        self,
        plugin: AgentPlugin,
        enabled: bool = True,
        priority: int = 100,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Register a plugin with the registry.

        Args:
            plugin: Plugin instance to register
            enabled: Whether plugin is enabled by default (only used if no persisted config exists)
            priority: Plugin priority (lower = higher priority) (only used if no persisted config exists)
            metadata: Additional metadata
        """
        if not hasattr(plugin, "name") or not plugin.name:
            raise ValueError("Plugin must have a 'name' attribute")

        plugin_name = plugin.name

        with self._lock:
            if plugin_name in self._plugins:
                logger.warning(
                    f"Plugin '{plugin_name}' is already registered. Overwriting."
                )

            self._plugins[plugin_name] = plugin

        # PHANTOM CONFIG FIX: Check persisted config before applying defaults
        # This prevents plugins from re-enabling themselves on restart if user disabled them
        persisted_config = None
        if self.config_manager:
            persisted_config = self.config_manager.get_plugin_config(plugin_name)
        
        # Use persisted config if available, otherwise use registration defaults
        if persisted_config:
            # Respect persisted configuration (user's explicit choice)
            final_enabled = persisted_config.get("enabled", enabled)
            final_priority = persisted_config.get("priority", priority)
            logger.debug(
                f"Plugin '{plugin_name}' registration: Using persisted config "
                f"(enabled={final_enabled}, priority={final_priority})"
            )
        else:
            # No persisted config, use registration defaults
            final_enabled = enabled
            final_priority = priority
            logger.debug(
                f"Plugin '{plugin_name}' registration: Using registration defaults "
                f"(enabled={final_enabled}, priority={final_priority})"
            )

        # Store metadata
        plugin_metadata = {
            "enabled": final_enabled,
            "priority": final_priority,
            "version": getattr(plugin, "version", "1.0.0"),
            "author": getattr(plugin, "author", "Unknown"),
            "description": getattr(plugin, "description", ""),
            **(metadata or {}),
        }
        self.state_manager.set_metadata(plugin_name, plugin_metadata)

        # Store config
        plugin_config = PluginConfig(
            enabled=final_enabled,
            priority=final_priority,
        )
        self.state_manager.set_config(plugin_name, plugin_config)

        # Update enabled state (in-memory only)
        if final_enabled:
            self.state_manager.enable_plugin(plugin_name)
        else:
            self.state_manager.disable_plugin(plugin_name)

        # Note: Persistence is now explicit via save_config() method
        # This makes registration fast and testable without file I/O

        logger.info(
            f"Registered plugin: {plugin_name} (priority: {final_priority}, enabled: {final_enabled})"
        )
    
    def save_config(self, plugin_name: Optional[str] = None) -> None:
        """
        Persist plugin configuration to disk.
        
        If plugin_name is provided, saves only that plugin's config.
        If None, saves all registered plugins' configs.
        
        Args:
            plugin_name: Optional plugin name to save, or None for all plugins
        """
        if not self.config_manager:
            return
            
        if plugin_name:
            # Save single plugin config
            metadata = self.state_manager.get_metadata(plugin_name)
            if metadata:
                self.config_manager.set_plugin_config(
                    plugin_name,
                    enabled=metadata.get("enabled", True),
                    priority=metadata.get("priority", 100),
                )
        else:
            # Save all plugin configs
            with self._lock:
                # Create a copy of keys to avoid iteration issues
                plugin_names = list(self._plugins.keys())
            
            # Save configs outside lock to avoid holding it during I/O
            for name in plugin_names:
                metadata = self.state_manager.get_metadata(name)
                if metadata:
                    self.config_manager.set_plugin_config(
                        name,
                        enabled=metadata.get("enabled", True),
                        priority=metadata.get("priority", 100),
                    )

    def unregister(self, plugin_name: str) -> None:
        """Unregister a plugin."""
        with self._lock:
            if plugin_name in self._plugins:
                del self._plugins[plugin_name]
                self.state_manager.remove_plugin(plugin_name)
                logger.info(f"Unregistered plugin: {plugin_name}")

    def get_plugin(self, plugin_name: str) -> Optional[AgentPlugin]:
        """Get a plugin by name."""
        with self._lock:
            return self._plugins.get(plugin_name)

    def get_enabled_plugins(self) -> List[AgentPlugin]:
        """
        Get all enabled plugins, sorted by priority.
        
        THREAD SAFETY: Protected by lock to prevent RuntimeError during iteration
        if plugins are dynamically loaded/unloaded concurrently.
        """
        enabled_names = self.state_manager.get_enabled_plugin_names()
        with self._lock:
            # Create a copy of the list to avoid iteration issues
            enabled = [
                self._plugins[name] for name in enabled_names if name in self._plugins
            ]
        # Sort by priority (lower = higher priority) - done outside lock to avoid holding it
        enabled.sort(
            key=lambda p: self.state_manager.get_metadata(p.name).get("priority", 100)
            if self.state_manager.get_metadata(p.name)
            else 100
        )
        return enabled

    def enable_plugin(self, plugin_name: str) -> bool:
        """Enable a plugin."""
        with self._lock:
            if plugin_name not in self._plugins:
                logger.warning(f"Cannot enable unknown plugin: {plugin_name}")
                return False

            if self.state_manager.enable_plugin(plugin_name):
                if self.config_manager:
                    self.config_manager.set_plugin_config(plugin_name, enabled=True)
                return True
            return False

    def disable_plugin(self, plugin_name: str) -> bool:
        """Disable a plugin."""
        with self._lock:
            if self.state_manager.disable_plugin(plugin_name):
                if self.config_manager:
                    self.config_manager.set_plugin_config(plugin_name, enabled=False)
                return True
            return False

    def get_metadata(self, plugin_name: str) -> Optional[Dict[str, Any]]:
        """Get metadata for a plugin."""
        return self.state_manager.get_metadata(plugin_name)

    def list_plugins(self) -> List[Dict[str, Any]]:
        """
        List all registered plugins with their metadata.
        
        THREAD SAFETY: Protected by lock to prevent RuntimeError during iteration.
        """
        with self._lock:
            # Create a copy of keys to avoid iteration issues
            plugin_names = list(self._plugins.keys())
        
        # Build result outside lock to avoid holding it during metadata lookups
        result = []
        for name in plugin_names:
            metadata = self.state_manager.get_metadata(name) or {}
            result.append(
                {
                    "name": name,
                    "enabled": self.state_manager.is_enabled(name),
                    **metadata,
                }
            )
        return result

    # Delegate lifecycle methods to lifecycle manager
    async def initialize_plugin(self, plugin: AgentPlugin) -> bool:
        """Initialize a plugin (delegates to lifecycle manager)."""
        return await self.lifecycle_manager.initialize_plugin(plugin)

    async def shutdown_plugin(self, plugin: AgentPlugin) -> None:
        """Shutdown a plugin (delegates to lifecycle manager)."""
        await self.lifecycle_manager.shutdown_plugin(plugin)

    async def initialize_all_plugins(self) -> int:
        """Initialize all enabled plugins (delegates to lifecycle manager)."""
        return await self.lifecycle_manager.initialize_all_plugins()

    async def shutdown_all_plugins(self) -> None:
        """Shutdown all initialized plugins (delegates to lifecycle manager)."""
        await self.lifecycle_manager.shutdown_all_plugins()
