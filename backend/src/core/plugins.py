"""
Plugin Registry System for the Desktop Assistant.

This module provides a centralized plugin registry with discovery, lifecycle management,
and clear extension points for developers. Enhanced with features including
entry point discovery, configuration management, and enhanced lifecycle support.
"""
import asyncio
import importlib
import importlib.util
import inspect
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional, Type, TypeVar, Set
from dataclasses import dataclass, field
import sys

try:
    if sys.version_info >= (3, 8):
        from importlib.metadata import entry_points
    else:
        from importlib_metadata import entry_points
except ImportError:
    entry_points = None

from backend.src.agent.plugins.interface import AgentPlugin
from backend.src.core.plugin_config import get_plugin_config_manager

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=AgentPlugin)


@dataclass
class PluginConfig:
    """Configuration for a plugin."""
    enabled: bool = True
    priority: int = 100
    config: Dict[str, Any] = field(default_factory=dict)
    dependencies: List[str] = field(default_factory=list)


@dataclass
class PluginMetadata:
    """Metadata about a plugin."""
    name: str
    version: str = "1.0.0"
    author: str = "Unknown"
    description: str = ""
    source: str = "manual"  # "entry_point", "filesystem", "manual"
    config: PluginConfig = field(default_factory=PluginConfig)
    dependencies: List[str] = field(default_factory=list)
    module_path: Optional[str] = None


class PluginDiscoverer(ABC):
    """Abstract base class for plugin discovery mechanisms."""
    
    @abstractmethod
    async def discover(self) -> List[Type[AgentPlugin]]:
        """Discover plugin classes."""
        pass
    
    @abstractmethod
    def get_source_name(self) -> str:
        """Get the name of this discovery source."""
        pass


class EntryPointPluginDiscoverer(PluginDiscoverer):
    """Discovers plugins via setuptools entry points."""
    
    def __init__(self, entry_point_group: str = "desktop_assistant.plugins"):
        """Initialize entry point discoverer."""
        self.entry_point_group = entry_point_group
    
    async def discover(self) -> List[Type[AgentPlugin]]:
        """Discover plugins from entry points."""
        if entry_points is None:
            logger.warning("importlib.metadata not available. Entry point discovery disabled.")
            return []
        
        discovered: List[Type[AgentPlugin]] = []
        
        try:
            # Handle different importlib.metadata APIs across Python versions
            if sys.version_info >= (3, 10):
                eps = entry_points(group=self.entry_point_group)
            else:
                eps = entry_points().get(self.entry_point_group, [])
                
            for entry_point in eps:
                try:
                    plugin_class = entry_point.load()
                    if not inspect.isclass(plugin_class) or not hasattr(plugin_class, "name"):
                        continue
                    discovered.append(plugin_class)
                    logger.debug(f"Discovered plugin via entry point: {entry_point.name}")
                except Exception as e:
                    logger.error(f"Error loading entry point '{entry_point.name}': {e}", exc_info=True)
        except Exception as e:
            logger.error(f"Error discovering entry points: {e}", exc_info=True)
        
        return discovered
    
    def get_source_name(self) -> str:
        return "entry_point"


class FilesystemPluginDiscoverer(PluginDiscoverer):
    """Discovers plugins from filesystem directories."""
    
    def __init__(self, plugin_dir: Path):
        self.plugin_dir = plugin_dir
    
    async def discover(self) -> List[Type[AgentPlugin]]:
        """Discover plugins from filesystem."""
        discovered: List[Type[AgentPlugin]] = []
        
        if not self.plugin_dir.exists():
            logger.warning(f"Plugin directory does not exist: {self.plugin_dir}")
            return discovered
        
        for py_file in self.plugin_dir.glob("*.py"):
            if py_file.name.startswith("__"):
                continue
            
            try:
                module_name = f"{self.plugin_dir.name}.{py_file.stem}"
                spec = importlib.util.spec_from_file_location(module_name, py_file)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    for name, obj in inspect.getmembers(module, inspect.isclass):
                        if name != "AgentPlugin" and hasattr(obj, "name") and inspect.isclass(obj):
                            discovered.append(obj)
                            logger.debug(f"Discovered plugin class: {name} in {py_file}")
            except Exception as e:
                logger.error(f"Error discovering plugins in {py_file}: {e}", exc_info=True)
        
        return discovered
    
    def get_source_name(self) -> str:
        return "filesystem"


class PluginRegistry:
    """
    Centralized registry for managing agent plugins.
    
    Provides plugin discovery, registration, lifecycle management, and
    dependency resolution for plugins.
    """
    
    def __init__(self, use_config_manager: bool = True):
        """
        Initialize the plugin registry.
        
        Args:
            use_config_manager: If True, use PluginConfigManager for persistence
        """
        self._plugins: Dict[str, AgentPlugin] = {}
        self._plugin_metadata: Dict[str, Dict[str, Any]] = {}
        self._plugin_configs: Dict[str, PluginConfig] = {}
        self._enabled_plugins: List[str] = []
        self._discoverers: List[PluginDiscoverer] = []
        self._initialized_plugins: Set[str] = set()
        self._config_manager = get_plugin_config_manager() if use_config_manager else None
        self._container = None

    def set_container(self, container: Any) -> None:
        """Set the DI container for plugin dependency injection."""
        self._container = container
    
    def register(
        self, 
        plugin: AgentPlugin, 
        enabled: bool = True,
        priority: int = 100,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Register a plugin with the registry.
        """
        if not hasattr(plugin, "name") or not plugin.name:
            raise ValueError("Plugin must have a 'name' attribute")
        
        plugin_name = plugin.name
        
        if plugin_name in self._plugins:
            logger.warning(f"Plugin '{plugin_name}' is already registered. Overwriting.")
        
        self._plugins[plugin_name] = plugin
        
        # Store metadata (backward compatible format)
        self._plugin_metadata[plugin_name] = {
            "enabled": enabled,
            "priority": priority,
            "version": getattr(plugin, "version", "1.0.0"),
            "author": getattr(plugin, "author", "Unknown"),
            "description": getattr(plugin, "description", ""),
            **(metadata or {})
        }
        
        # Store config
        self._plugin_configs[plugin_name] = PluginConfig(
            enabled=enabled,
            priority=priority,
        )
        
        if enabled:
            if plugin_name not in self._enabled_plugins:
                self._enabled_plugins.append(plugin_name)
        
        # Save to config manager if available
        if self._config_manager:
            self._config_manager.set_plugin_config(
                plugin_name,
                enabled=enabled,
                priority=priority,
            )
        
        logger.info(f"Registered plugin: {plugin_name} (priority: {priority}, enabled: {enabled})")
    
    def unregister(self, plugin_name: str) -> None:
        """Unregister a plugin."""
        if plugin_name in self._plugins:
            del self._plugins[plugin_name]
            del self._plugin_metadata[plugin_name]
            if plugin_name in self._enabled_plugins:
                self._enabled_plugins.remove(plugin_name)
            logger.info(f"Unregistered plugin: {plugin_name}")
    
    def get_plugin(self, plugin_name: str) -> Optional[AgentPlugin]:
        """Get a plugin by name."""
        return self._plugins.get(plugin_name)
    
    def get_enabled_plugins(self) -> List[AgentPlugin]:
        """Get all enabled plugins, sorted by priority."""
        enabled = [
            self._plugins[name] 
            for name in self._enabled_plugins 
            if name in self._plugins
        ]
        # Sort by priority (lower = higher priority)
        enabled.sort(
            key=lambda p: self._plugin_metadata[p.name].get("priority", 100)
        )
        return enabled
    
    def enable_plugin(self, plugin_name: str) -> bool:
        """Enable a plugin."""
        if plugin_name not in self._plugins:
            logger.warning(f"Cannot enable unknown plugin: {plugin_name}")
            return False
        
        if plugin_name not in self._enabled_plugins:
            self._enabled_plugins.append(plugin_name)
            self._plugin_metadata[plugin_name]["enabled"] = True
            if plugin_name in self._plugin_configs:
                self._plugin_configs[plugin_name].enabled = True
            
            # Save to config manager
            if self._config_manager:
                self._config_manager.set_plugin_config(plugin_name, enabled=True)
            
            logger.info(f"Enabled plugin: {plugin_name}")
            return True
        return False
    
    def disable_plugin(self, plugin_name: str) -> bool:
        """Disable a plugin."""
        if plugin_name in self._enabled_plugins:
            self._enabled_plugins.remove(plugin_name)
            self._plugin_metadata[plugin_name]["enabled"] = False
            if plugin_name in self._plugin_configs:
                self._plugin_configs[plugin_name].enabled = False
            
            # Save to config manager
            if self._config_manager:
                self._config_manager.set_plugin_config(plugin_name, enabled=False)
            
            logger.info(f"Disabled plugin: {plugin_name}")
            return True
        return False
    
    def get_metadata(self, plugin_name: str) -> Optional[Dict[str, Any]]:
        """Get metadata for a plugin."""
        return self._plugin_metadata.get(plugin_name)
    
    def list_plugins(self) -> List[Dict[str, Any]]:
        """List all registered plugins with their metadata."""
        return [
            {
                "name": name,
                "enabled": name in self._enabled_plugins,
                **self._plugin_metadata[name]
            }
            for name in self._plugins.keys()
        ]
    
    def discover_plugins(self, plugin_dir: Path) -> List[Type[AgentPlugin]]:
        """
        Discover plugins in a directory.
        """
        discovered = []
        
        if not plugin_dir.exists():
            logger.warning(f"Plugin directory does not exist: {plugin_dir}")
            return discovered
        
        # Import all Python files in the directory
        for py_file in plugin_dir.glob("*.py"):
            if py_file.name.startswith("__"):
                continue
            
            try:
                # Convert to module path
                module_name = f"{plugin_dir.name}.{py_file.stem}"
                
                # Import the module
                spec = importlib.util.spec_from_file_location(module_name, py_file)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    
                    # Find all classes that implement AgentPlugin
                    for name, obj in inspect.getmembers(module, inspect.isclass):
                        if (
                            name != "AgentPlugin" and
                            issubclass(obj, AgentPlugin) and
                            obj is not AgentPlugin
                        ):
                            discovered.append(obj)
                            logger.debug(f"Discovered plugin class: {name} in {py_file}")
            
            except Exception as e:
                logger.error(f"Error discovering plugins in {py_file}: {e}", exc_info=True)
        
        return discovered
    
    async def initialize_plugin(self, plugin: AgentPlugin) -> bool:
        """
        Initialize a plugin (call its setup/init method if it exists).
        Injects container if available.
        """
        if hasattr(plugin, "initialize") and callable(plugin.initialize):
            try:
                if inspect.iscoroutinefunction(plugin.initialize):
                    # Check if it accepts arguments (like container)
                    sig = inspect.signature(plugin.initialize)
                    if "container" in sig.parameters and self._container:
                        await plugin.initialize(container=self._container)
                    else:
                        await plugin.initialize()
                else:
                    # Sync initialize
                    plugin.initialize()
                    
                self._initialized_plugins.add(plugin.name)
                logger.debug(f"Initialized plugin: {plugin.name}")
                return True
            except Exception as e:
                logger.error(f"Failed to initialize plugin {plugin.name}: {e}", exc_info=True)
                return False
        return True
    
    async def shutdown_plugin(self, plugin: AgentPlugin) -> None:
        """
        Shutdown a plugin (call its cleanup method if it exists).
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
                logger.error(f"Error shutting down plugin {plugin_name}: {e}", exc_info=True)
    
    def register_discoverer(self, discoverer: PluginDiscoverer) -> None:
        """Register a plugin discovery mechanism."""
        if discoverer not in self._discoverers:
            self._discoverers.append(discoverer)
            logger.info(f"Registered plugin discoverer: {discoverer.get_source_name()}")
    
    async def discover_and_register(self, auto_enable: bool = True) -> int:
        """
        Discover plugins from all registered discoverers and register them.
        """
        discovered_count = 0
        
        for discoverer in self._discoverers:
            try:
                plugin_classes = await discoverer.discover()
                
                for plugin_class in plugin_classes:
                    try:
                        # Instantiate plugin (assumes no-arg constructor or handles default args)
                        plugin_instance = plugin_class()
                        plugin_name = getattr(plugin_instance, "name", plugin_class.__name__)
                        
                        # Load config from config manager if available
                        saved_enabled = auto_enable
                        saved_priority = 100
                        if self._config_manager:
                            saved_config = self._config_manager.get_plugin_config(plugin_name)
                            if saved_config:
                                saved_enabled = saved_config.get("enabled", auto_enable)
                                saved_priority = saved_config.get("priority", 100)
                        
                        self.register(
                            plugin_instance,
                            enabled=saved_enabled,
                            priority=saved_priority,
                            metadata={
                                "source": discoverer.get_source_name(),
                                "module_path": f"{plugin_class.__module__}.{plugin_class.__name__}",
                            }
                        )
                        discovered_count += 1
                    except Exception as e:
                        logger.error(f"Error registering discovered plugin {plugin_class.__name__}: {e}", exc_info=True)
            except Exception as e:
                logger.error(f"Error in discoverer {discoverer.get_source_name()}: {e}", exc_info=True)
        
        logger.info(f"Discovered and registered {discovered_count} plugins")
        return discovered_count
    
    async def initialize_all_plugins(self) -> int:
        """Initialize all enabled plugins."""
        initialized_count = 0
        for plugin in self.get_enabled_plugins():
            if await self.initialize_plugin(plugin):
                initialized_count += 1
        logger.info(f"Initialized {initialized_count} plugins")
        return initialized_count
    
    async def shutdown_all_plugins(self) -> None:
        """Shutdown all initialized plugins."""
        plugins_to_shutdown = list(self._initialized_plugins)
        for plugin_name in plugins_to_shutdown:
            plugin = self._plugins.get(plugin_name)
            if plugin:
                await self.shutdown_plugin(plugin)
        logger.info("Shutdown all plugins")


# Global plugin registry instance
plugin_registry = PluginRegistry()

# Convenience functions for enhanced features
def get_enhanced_plugin_registry() -> PluginRegistry:
    """Get the global plugin registry (enhanced version)."""
    return plugin_registry


def initialize_enhanced_plugin_registry(
    plugin_dirs: Optional[List[Path]] = None,
    auto_discover: bool = True,
) -> PluginRegistry:
    """
    Initialize the plugin registry with discoverers.
    """
    registry = plugin_registry
    
    # Register entry point discoverer
    entry_point_discoverer = EntryPointPluginDiscoverer()
    registry.register_discoverer(entry_point_discoverer)
    
    # Register filesystem discoverers
    if plugin_dirs:
        for plugin_dir in plugin_dirs:
            if plugin_dir.exists():
                filesystem_discoverer = FilesystemPluginDiscoverer(plugin_dir)
                registry.register_discoverer(filesystem_discoverer)
    
    # Auto-discover if requested
    if auto_discover:
        asyncio.create_task(registry.discover_and_register())
    
    logger.info("Enhanced plugin registry initialized")
    return registry
