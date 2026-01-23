"""
WebSocket Message Handlers.

This module provides handlers for different WebSocket message types,
organized using the registry pattern for easy extensibility.

Handler Architecture:
- core.base: MessageHandler base class and MessageHandlerRegistry
- Each handler implements MessageHandler.handle() method
- Handlers are stateless singletons (state in SessionManager/AgentSession)
- Registry routes messages by type to appropriate handler

Handler Responsibilities:
- query.py: User query processing (main agent interaction)
- settings.py: Configuration management (load/update/list models)
- tool_result.py: Frontend tool execution results
- wakeword.py: Wakeword detection and activation

Related Components:
- query.formatter: Formats agent events to WebSocket messages
- query.pipeline: Orchestrates event processing pipeline
- tts.manager: TTS lifecycle management
- tts.processor: TTS event filtering (removes tool calls from speech)
- core.transport: Transport abstraction (testing seam)
- core.errors: Standardized error handling utilities

Handlers are registered in ApiContainer and accessed via MessageHandlerRegistry.
"""
from backend.src.api.core.base import (
    MessageHandler,
    MessageHandlerRegistry,
)
from backend.src.api.handlers.query import QueryMessageHandler
from backend.src.api.handlers.settings import (
    ListModelsHandler,
)
from backend.src.api.handlers.wakeword import WakewordHandler
from backend.src.api.handlers.tool_result import ToolResultHandler

__all__ = [
    "MessageHandler",
    "MessageHandlerRegistry",
    "QueryMessageHandler",
    "ListModelsHandler",
    "WakewordHandler",
    "ToolResultHandler",
]
