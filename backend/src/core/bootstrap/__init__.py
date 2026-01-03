"""
Bootstrap Package.

Provides initialization components for application startup.
"""
from backend.src.core.bootstrap.coordinator import InitializationCoordinator
from backend.src.core.bootstrap.handler_initializer import HandlerInitializer
from backend.src.core.bootstrap.plugin_initializer import PluginInitializer

__all__ = [
    "InitializationCoordinator",
    "PluginInitializer",
    "HandlerInitializer",
]
