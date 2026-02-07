"""
Message Handling for WebSocket Routes.

Handles message parsing, validation, routing, and error responses.
"""
import json
import logging
import asyncio
from typing import Optional

from pydantic import ValidationError as PydanticValidationError, TypeAdapter

from backend.src.api.infrastructure.registry import MessageHandlerRegistry
from backend.src.api.infrastructure.errors import send_error_response, sanitize_error_message
from backend.src.api.transport.websocket import SafeWebSocket
from backend.src.api.schema import IncomingMessage

logger = logging.getLogger(__name__)

# Create TypeAdapter once at module level for performance
_INCOMING_MESSAGE_ADAPTER = TypeAdapter(IncomingMessage)


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
    # SECURITY: Validate message size after receiving
    if len(data) > max_message_size:
        return None, f"Message too large: {len(data)} bytes (max: {max_message_size} bytes)"
    
    try:
        # PERFORMANCE: Offload large JSON parsing to thread pool
        # With max_message_size (default 10MB), parsing can block the event loop
        # for 50-200ms, causing jitter for all other connected clients
        # (e.g., stalling audio streams)
        loop = asyncio.get_running_loop()
        json_data = await loop.run_in_executor(None, json.loads, data)

        if not isinstance(json_data, dict):
            payload_type = type(json_data).__name__
            return None, (
                f"Invalid message format: root must be an object, got {payload_type}"
            )
        
        # Inject user_id from connection context BEFORE validation
        # BaseMessage requires user_id, but it comes from connection context, not client JSON
        json_data["user_id"] = user_id
        
        # Validate and parse message using Pydantic
        try:
            # Use pre-created TypeAdapter for performance
            validated_msg = _INCOMING_MESSAGE_ADAPTER.validate_python(json_data)
            return validated_msg, None
        except PydanticValidationError as e:
            # Validation failed - format error details
            msg_id = json_data.get("id")
            error_details = "; ".join(
                f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}"
                for err in e.errors()
            )
            return None, f"Invalid message format: {error_details}"
    
    except json.JSONDecodeError:
        # Malformed JSON
        return None, "Malformed JSON"
    except Exception as e:
        # Unexpected error - sanitize for client
        logger.error(f"Unexpected error parsing message: {e}", exc_info=True)
        return None, "An internal error occurred"


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
        # FIX #4: Ensure logging even if send fails
        try:
            await send_error(websocket, msg_id, str(e))
        except Exception as send_err:
            logger.warning(f"Failed to send error response to user {user_id} (msg_id={msg_id}): {send_err}", exc_info=True)
    except Exception as e:
        # Unexpected error - send sanitized error to prevent information leakage
        # FIX #4: Ensure logging even if send fails
        try:
            sanitized_msg = sanitize_error_message(e)
            await send_error(websocket, msg_id, sanitized_msg)
        except Exception as send_err:
            logger.error(f"Failed to send critical error response to user {user_id} (msg_id={msg_id}): {send_err}", exc_info=True)


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
