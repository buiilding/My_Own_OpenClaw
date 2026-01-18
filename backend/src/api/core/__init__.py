"""
API Core Infrastructure.

Contains base classes, transport abstractions, and error handling utilities.
"""
from backend.src.api.core.base import MessageHandler, MessageHandlerRegistry
from backend.src.api.core.transport import (
    TransportSender,
    WebSocketSender,
    WebSocketTransportSender,
)
from backend.src.api.core.errors import (
    send_error_response,
    send_success_response,
    sanitize_error_message,
)

__all__ = [
    "MessageHandler",
    "MessageHandlerRegistry",
    "TransportSender",
    "WebSocketSender",
    "WebSocketTransportSender",
    "send_error_response",
    "send_success_response",
    "sanitize_error_message",
]
