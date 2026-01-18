"""
WebSocket Message Handlers.

This module provides handlers for different WebSocket message types,
organized using the registry pattern for easy extensibility.

Handlers are now managed by the DI container (ApiContainer).
"""
from backend.src.api.handlers.base import (
    MessageHandler,
    MessageHandlerRegistry,
)
from backend.src.api.handlers.query_handler import QueryMessageHandler
from backend.src.api.handlers.settings_handler import (
    ListModelsHandler,
    LoadSettingsHandler,
    UpdateSettingsHandler,
)
from backend.src.api.handlers.wakeword_handler import WakewordHandler
from backend.src.api.handlers.tool_result_handler import ToolResultHandler

__all__ = [
    "MessageHandler",
    "MessageHandlerRegistry",
    "QueryMessageHandler",
    "LoadSettingsHandler",
    "UpdateSettingsHandler",
    "ListModelsHandler",
    "WakewordHandler",
    "ToolResultHandler",
]
