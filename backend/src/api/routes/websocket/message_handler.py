"""
Message Handling for WebSocket Routes.

Handles message parsing, validation, routing, and error responses.
"""
import asyncio
import logging
from typing import Optional

from backend.src.api.infrastructure.registry import MessageHandlerRegistry
from backend.src.api.infrastructure.errors import send_error_response, sanitize_error_message
from backend.src.api.transport.websocket import SafeWebSocket
from backend.src.api.schemas import IncomingMessage
from backend.src.api.routes.websocket.json_parse import (
    DEFAULT_JSON_PARSE_OFFLOAD_BYTES,
    parse_json_object_payload,
)
from backend.src.api.routes.websocket.message_parse_runtime import (
    parse_and_validate_message_runtime,
)

logger = logging.getLogger(__name__)

_JSON_PARSE_OFFLOAD_BYTES = DEFAULT_JSON_PARSE_OFFLOAD_BYTES

async def parse_and_validate_message(
    data: str,
    user_id: str,
    max_message_size: int
) -> tuple[IncomingMessage | None, Optional[str]]:
    """
    Parse and validate incoming WebSocket message.
    
    Args:
        data: Raw message data
        user_id: User ID from connection context
        max_message_size: Maximum allowed message size
        
    Returns:
        Tuple of (validated message or None, error message or None)
    """
    return await parse_and_validate_message_runtime(
        data=data,
        user_id=user_id,
        max_message_size=max_message_size,
        json_parse_offload_bytes=_JSON_PARSE_OFFLOAD_BYTES,
        parse_json_object_payload_fn=parse_json_object_payload,
        loop_getter=asyncio.get_running_loop,
        logger=logger,
    )


async def handle_message(
    websocket: SafeWebSocket, 
    message: IncomingMessage, 
    handler_registry: MessageHandlerRegistry,
    user_id: str
) -> None:
    """
    Handle incoming WebSocket message using handler registry with type-based routing.
    
    RELIABILITY: This function is executed as a tracked task. If handlers spawn
    background sub-tasks (e.g., via asyncio.create_task()), they MUST be:
    1. Attached to the AgentSession for cleanup in session.cleanup(), OR
    2. Tracked in a session-scoped task registry, OR
    3. Created with a cancellation token that can be triggered on WebSocket disconnect.
    
    Untracked sub-tasks will continue running after WebSocket disconnect, causing
    resource leaks and potential security issues (e.g., processing requests for
    disconnected users).
    
    Args:
        websocket: SafeWebSocket connection (thread-safe wrapper)
        message: Validated Pydantic message object
        handler_registry: Message handler registry instance
        user_id: User ID from connection context
    """
    msg_id = message.id
    msg_type = message.type

    try:
        # Use handler registry to route message based on validated type
        # Pass typed Pydantic model directly to handlers (type-safe)
        await handler_registry.handle(msg_type, message, websocket, user_id)
    
    except ValueError as e:
        # Handler not found or validation error - safe to expose
        await _send_error_with_fallback_logging(
            websocket=websocket,
            msg_id=msg_id,
            user_id=user_id,
            message=str(e),
            critical=False,
        )
    except Exception as e:
        # Unexpected error - send sanitized error to prevent information leakage
        sanitized_msg = sanitize_error_message(e)
        await _send_error_with_fallback_logging(
            websocket=websocket,
            msg_id=msg_id,
            user_id=user_id,
            message=sanitized_msg,
            critical=True,
        )


async def send_error(
    websocket: SafeWebSocket, 
    msg_id: Optional[str], 
    message: Optional[str] = None,
    exception: Optional[Exception] = None
):
    """
    Send error response to WebSocket client.
    
    Delegates to error_utils.send_error_response to ensure canonical error payload shape.
    This is the ONLY way errors should be sent from the WebSocket route layer.
    
    Security: If exception is provided, message is sanitized to prevent information leakage.
    Full exception details are logged server-side.
    
    Args:
        websocket: SafeWebSocket connection (thread-safe wrapper)
        msg_id: Message ID (optional)
        message: Error message (optional, used if exception is None)
        exception: Optional exception to sanitize. If provided, message is ignored.
    """
    # send_error_response now accepts SafeWebSocket directly for thread-safe writes
    await send_error_response(websocket, msg_id, message or "", exception=exception)


async def _send_error_with_fallback_logging(
    *,
    websocket: SafeWebSocket,
    msg_id: Optional[str],
    user_id: str,
    message: str,
    critical: bool,
) -> None:
    """
    Send a client error and preserve route stability when socket writes fail.

    Routing failures should never raise from the error path; if the websocket is
    already closed we log at the appropriate severity and return.
    """
    try:
        await send_error(websocket, msg_id, message)
    except Exception as send_err:
        log = logger.error if critical else logger.warning
        qualifier = "critical " if critical else ""
        log(
            "Failed to send %serror response to user %s (msg_id=%s): %s",
            qualifier,
            user_id,
            msg_id,
            send_err,
            exc_info=True,
        )
