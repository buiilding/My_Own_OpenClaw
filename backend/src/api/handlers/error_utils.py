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

SECURITY:
- All error messages sent to clients are sanitized to prevent information leakage
- Full exception details (stack traces, file paths, internal state) are logged server-side
- Client-facing messages are generic and safe (e.g., "An internal error occurred")

SILENT FAILURE PREVENTION:
- All error paths in handlers must call send_error_response()
- Handlers that catch exceptions must send error responses (not just log)
- The only exception is connection errors (WebSocketDisconnect), which are
  expected when clients disconnect and are logged at debug level
"""
import logging
from typing import Optional, Any

from fastapi import WebSocketDisconnect

from backend.src.core.validation import ValidationError
from backend.src.api.handlers.transport import WebSocketSender, WebSocketTransportSender

logger = logging.getLogger(__name__)


def sanitize_error_message(exception: Exception, context: Optional[str] = None) -> str:
    """
    Sanitize exception message for client consumption.
    
    Security: Prevents information leakage by filtering internal details
    (file paths, stack traces, implementation details) from error messages.
    
    Full exception details are logged server-side via logger.error().
    Client-facing messages are generic and safe.
    
    Args:
        exception: Exception instance to sanitize
        context: Optional context string for more specific error messages
        
    Returns:
        Sanitized error message safe for client consumption
    """
    # Validation errors are safe to expose (user input validation)
    if isinstance(exception, ValidationError):
        return exception.message if hasattr(exception, 'message') else str(exception)
    
    # ValueError/KeyError from user input validation - safe to expose
    if isinstance(exception, (ValueError, KeyError)):
        # Check if it's a user-facing validation error
        error_str = str(exception)
        # Common validation patterns that are safe
        if any(keyword in error_str.lower() for keyword in [
            'invalid', 'required', 'missing', 'expected', 'not found', 'not allowed'
        ]):
            return error_str
    
    # All other exceptions: return generic message to prevent information leakage
    # Full details are logged server-side via logger.error(exc_info=True)
    if context:
        return f"{context}: An internal error occurred"
    return "An internal error occurred"


async def send_error_response(
    websocket: WebSocketSender,
    msg_id: Optional[str],
    message: str,
    error_type: str = "error",
    exception: Optional[Exception] = None
) -> None:
    """
    Send standardized error response to WebSocket client.
    
    Uses WebSocketSender protocol to ensure thread-safe serialization of writes.
    
    Security: If an exception is provided, the message is sanitized to prevent
    information leakage. Full exception details are logged server-side.
    
    Handles connection errors gracefully - if connection is closed, logs at
    debug level and returns silently. This is expected behavior when clients
    disconnect during request processing.
    
    Args:
        websocket: WebSocketSender (thread-safe protocol implementation)
        msg_id: Message ID from original request (optional)
        message: Error message to send (if exception is None, this is sent as-is)
        error_type: Error message type (default: "error")
        exception: Optional exception to sanitize. If provided, message is ignored
                   and sanitize_error_message() is used instead.
    """
    # Sanitize message if exception is provided
    if exception is not None:
        # Log full exception details server-side for debugging
        logger.error(
            f"Error in handler (msg_id={msg_id}): {type(exception).__name__}: {exception}",
            exc_info=True
        )
        # Use sanitized message for client
        message = sanitize_error_message(exception, context=None)
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
    websocket: WebSocketSender,
    msg_id: str,
    response_type: str,
    payload: dict
) -> None:
    """
    Send standardized success response to WebSocket client.
    
    Uses WebSocketSender protocol to ensure thread-safe serialization of writes.
    
    Handles connection errors gracefully - if connection is closed, logs at
    debug level and returns silently.
    
    Args:
        websocket: WebSocketSender (thread-safe protocol implementation)
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
