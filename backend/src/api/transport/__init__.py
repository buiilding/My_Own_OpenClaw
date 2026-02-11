"""
Transport Layer.

Provides protocol definitions and implementations for WebSocket communication.
"""

from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.transport.sender import TransportSender, WebSocketTransportSender
from backend.src.api.transport.envelope import (
    attach_context_fields,
    build_transport_message,
)
from backend.src.api.transport.websocket import SafeWebSocket

__all__ = [
    "WebSocketSender",
    "TransportSender",
    "WebSocketTransportSender",
    "attach_context_fields",
    "build_transport_message",
    "SafeWebSocket",
]
