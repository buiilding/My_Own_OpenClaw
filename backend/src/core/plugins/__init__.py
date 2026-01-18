"""
Plugin System Package.

Provides plugin registry, discovery, metadata, and lifecycle management.
"""
from backend.src.core.plugin_config import PluginConfigManager
from backend.src.core.plugins.discovery import (
    EntryPointPluginDiscoverer,
    FilesystemPluginDiscoverer,
    PluginDiscoverer,
)
from backend.src.core.plugins.discovery_service import PluginDiscoveryService
from backend.src.core.plugins.lifecycle import PluginLifecycleManager
from backend.src.core.plugins.metadata import PluginConfig, PluginMetadata
from backend.src.core.plugins.registry import PluginRegistry
from backend.src.core.plugins.state_manager import PluginStateManager

__all__ = [
    "PluginRegistry",
    "PluginDiscoverer",
    "EntryPointPluginDiscoverer",
    "FilesystemPluginDiscoverer",
    "PluginConfig",
    "PluginMetadata",
    "PluginLifecycleManager",
    "PluginStateManager",
    "PluginConfigManager",
    "PluginDiscoveryService",
]
