"""
Infrastructure Layer.

Provides base classes, registry, and error handling utilities.
"""
from backend.src.api.infrastructure.handler import MessageHandler
from backend.src.api.infrastructure.registry import MessageHandlerRegistry
from backend.src.api.infrastructure.errors import (
    send_error_response,
    send_success_response,
    sanitize_error_message,
)

__all__ = [
    "MessageHandler",
    "MessageHandlerRegistry",
    "send_error_response",
    "send_success_response",
    "sanitize_error_message",
]
