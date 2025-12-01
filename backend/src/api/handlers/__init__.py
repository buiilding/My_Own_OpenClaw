"""
WebSocket Message Handlers.

This module provides handlers for different WebSocket message types,
organized using the registry pattern for easy extensibility.
"""
from backend.src.api.handlers.base import (
    MessageHandler,
    MessageHandlerRegistry,
    get_handler_registry,
    initialize_handler_registry,
)
from backend.src.api.handlers.ping_handler import PingMessageHandler
from backend.src.api.handlers.query_handler import QueryMessageHandler
from backend.src.api.handlers.settings_handler import (
    ListModelsHandler,
    LoadSettingsHandler,
    UpdateSettingsHandler,
)
from backend.src.api.handlers.wakeword_handler import WakewordHandler

__all__ = [
    "MessageHandler",
    "MessageHandlerRegistry",
    "get_handler_registry",
    "initialize_handler_registry",
    "QueryMessageHandler",
    "PingMessageHandler",
    "LoadSettingsHandler",
    "UpdateSettingsHandler",
    "ListModelsHandler",
    "WakewordHandler",
    "initialize_handlers",
]


def initialize_handlers(session_manager) -> MessageHandlerRegistry:
    """
    Initialize and register all WebSocket message handlers.

    Args:
        session_manager: SessionManager instance

    Returns:
        Initialized MessageHandlerRegistry instance
    """
    from backend.src.core.config_service import get_config_service
    
    registry = initialize_handler_registry()
    config_service = get_config_service()

    # Register handlers
    registry.register("ping", PingMessageHandler())
    registry.register("query", QueryMessageHandler(session_manager))
    registry.register("load-settings", LoadSettingsHandler())
    registry.register("update-settings", UpdateSettingsHandler(session_manager))
    registry.register("list-models", ListModelsHandler())
    registry.register("wakeword-detected", WakewordHandler(config_service.get_config()))

    return registry
