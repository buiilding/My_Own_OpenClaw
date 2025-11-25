"""
WebSocket Message Handlers.

This module provides handlers for different WebSocket message types,
organized using the registry pattern for easy extensibility.
"""
from backend.src.api.handlers.base import (
    MessageHandler,
    MessageHandlerRegistry,
    get_handler_registry,
    initialize_handler_registry
)
from backend.src.api.handlers.query_handler import QueryMessageHandler
from backend.src.api.handlers.ping_handler import PingMessageHandler
from backend.src.api.handlers.settings_handler import (
    LoadSettingsHandler,
    UpdateSettingsHandler,
    ListModelsHandler
)


def initialize_handlers(session_manager) -> MessageHandlerRegistry:
    """
    Initialize and register all WebSocket message handlers.
    
    Args:
        session_manager: SessionManager instance
        
    Returns:
        Initialized MessageHandlerRegistry instance
    """
    registry = initialize_handler_registry()
    
    # Register handlers
    registry.register("ping", PingMessageHandler())
    registry.register("query", QueryMessageHandler(session_manager))
    registry.register("load-settings", LoadSettingsHandler())
    registry.register("update-settings", UpdateSettingsHandler(session_manager))
    registry.register("list-models", ListModelsHandler())
    
    return registry
