"""WebSocket route package export surface."""

from __future__ import annotations

import asyncio

from fastapi import WebSocketDisconnect

from . import router as router_module
from .connection import cleanup_connection, perform_handshake
from .message_handler import handle_message, parse_and_validate_message, send_error
from .task_manager import TaskManager
from backend.src.api.transport.websocket import SafeWebSocket

router = router_module.router


async def websocket_endpoint(*args, **kwargs):
    """Compatibility wrapper exposing websocket route dependencies for monkeypatch tests."""
    router_module.SafeWebSocket = SafeWebSocket
    router_module.TaskManager = TaskManager
    router_module.perform_handshake = perform_handshake
    router_module.cleanup_connection = cleanup_connection
    router_module.parse_and_validate_message = parse_and_validate_message
    router_module.handle_message = handle_message
    router_module.send_error = send_error
    return await router_module.websocket_endpoint(*args, **kwargs)


async def _close_connection_on_timeout(*args, **kwargs):
    return await router_module._close_connection_on_timeout(*args, **kwargs)


__all__ = [
    "TaskManager",
    "WebSocketDisconnect",
    "SafeWebSocket",
    "_close_connection_on_timeout",
    "asyncio",
    "cleanup_connection",
    "handle_message",
    "parse_and_validate_message",
    "perform_handshake",
    "router",
    "send_error",
    "websocket_endpoint",
]
