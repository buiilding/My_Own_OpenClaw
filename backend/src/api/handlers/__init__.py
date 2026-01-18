"""
WebSocket Message Handlers.

This module provides handlers for different WebSocket message types,
organized using the registry pattern for easy extensibility.

Handler Architecture:
- base.py: MessageHandler base class and MessageHandlerRegistry
- Each handler implements MessageHandler.handle() method
- Handlers are stateless singletons (state in SessionManager/AgentSession)
- Registry routes messages by type to appropriate handler

Handler Responsibilities:
- query_handler.py: User query processing (main agent interaction)
- settings_handler.py: Configuration management (load/update/list models)
- tool_result_handler.py: Frontend tool execution results
- wakeword_handler.py: Wakeword detection and activation
- response_formatter.py: Formats agent events to WebSocket messages
- stream_pipeline.py: Orchestrates event processing pipeline
- tts_manager.py: TTS lifecycle management
- tts_processor.py: TTS event filtering (removes tool calls from speech)
- transport.py: Transport abstraction (testing seam)
- error_utils.py: Standardized error handling utilities

Handlers are registered in ApiContainer and accessed via MessageHandlerRegistry.
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
