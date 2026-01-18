"""
Error Handling Utilities for WebSocket Handlers.

Provides standardized error handling and response sending for handlers.
All handlers MUST use these utilities to ensure consistent error behavior.

CANONICAL ERROR PAYLOAD SHAPE:
All error responses follow this exact structure:
{
    "type": "error",
    "id": <message_id> (optional),
    "payload": {
        "message": <error_message_string>
    }
}

ENFORCEMENT:
- All handlers must use send_error_response() to send errors
- websocket.py route layer uses send_error_response() via send_error() wrapper
- No handler should manually construct error messages
- This ensures clients receive consistent error payloads

SILENT FAILURE PREVENTION:
- All error paths in handlers must call send_error_response()
- Handlers that catch exceptions must send error responses (not just log)
- The only exception is connection errors (WebSocketDisconnect), which are
  expected when clients disconnect and are logged at debug level
"""
import logging
from typing import Optional, Union, Any

from fastapi import WebSocket, WebSocketDisconnect

from backend.src.api.handlers.transport import WebSocketTransportSender

logger = logging.getLogger(__name__)


async def send_error_response(
    websocket: Union[WebSocket, Any],
    msg_id: Optional[str],
    message: str,
    error_type: str = "error"
) -> None:
    """
    Send standardized error response to WebSocket client.
    
    Accepts SafeWebSocket or raw WebSocket. SafeWebSocket is preferred to ensure
    thread-safe serialization of writes.
    
    Handles connection errors gracefully - if connection is closed, logs at
    debug level and returns silently. This is expected behavior when clients
    disconnect during request processing.
    
    Args:
        websocket: WebSocket connection (SafeWebSocket or WebSocket)
        msg_id: Message ID from original request (optional)
        message: Error message to send
        error_type: Error message type (default: "error")
    """
    try:
        # WebSocketTransportSender now accepts SafeWebSocket for thread-safe writes
        transport = WebSocketTransportSender(websocket)
        await transport.send({
            "type": error_type,
            "id": msg_id,
            "payload": {"message": message}
        })
    except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
        # Connection closed - expected in some cases (client disconnect, etc.)
        # Log at debug level to avoid noise in production logs
        logger.debug(f"Failed to send error response to closed connection: {e}")


async def send_success_response(
    websocket: Union[WebSocket, Any],
    msg_id: str,
    response_type: str,
    payload: dict
) -> None:
    """
    Send standardized success response to WebSocket client.
    
    Accepts SafeWebSocket or raw WebSocket. SafeWebSocket is preferred to ensure
    thread-safe serialization of writes.
    
    Handles connection errors gracefully - if connection is closed, logs at
    debug level and returns silently.
    
    Args:
        websocket: WebSocket connection (SafeWebSocket or WebSocket)
        msg_id: Message ID from original request
        response_type: Response message type (e.g., "settings-updated")
        payload: Response payload dictionary
    """
    try:
        # WebSocketTransportSender now accepts SafeWebSocket for thread-safe writes
        transport = WebSocketTransportSender(websocket)
        await transport.send({
            "type": response_type,
            "id": msg_id,
            "payload": payload
        })
    except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
        # Connection closed - expected in some cases
        logger.debug(f"Failed to send success response to closed connection: {e}")
