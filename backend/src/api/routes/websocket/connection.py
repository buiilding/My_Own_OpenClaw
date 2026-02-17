"""
Connection Lifecycle Management for WebSocket Routes.

Handles handshake, connection setup, and cleanup.
"""
import json
import logging
import asyncio

from fastapi import WebSocket
from pydantic import ValidationError as PydanticValidationError

from backend.src.api.transport.websocket import SafeWebSocket
from backend.src.api.schema import HandshakeMessage
from backend.src.api.routes.websocket.task_manager import TaskManager
from backend.src.api.routes.websocket.json_parse import (
    DEFAULT_JSON_PARSE_OFFLOAD_BYTES,
    JsonRootTypeError,
    parse_json_object_payload,
)

logger = logging.getLogger(__name__)
_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES = DEFAULT_JSON_PARSE_OFFLOAD_BYTES


async def _close_policy_violation(safe_ws: SafeWebSocket, reason: str) -> None:
    """Close websocket with policy-violation code and swallow close failures."""
    try:
        await safe_ws.close(code=1008)  # Policy Violation
    except Exception as close_error:
        logger.debug(f"Error closing WebSocket after {reason}: {close_error}")


async def _fail_handshake(
    *,
    safe_ws: SafeWebSocket,
    error: Exception,
    close_reason: str,
    validation_error: bool,
) -> None:
    """
    Log handshake failure and close the websocket with policy-violation semantics.

    Validation/JSON issues are expected client errors and log at warning level.
    Unexpected runtime failures log at error level.
    """
    if validation_error:
        logger.warning("Handshake validation failed (%s): %s", close_reason, error)
    else:
        logger.error("Handshake error (%s): %s", close_reason, error)
    await _close_policy_violation(safe_ws, close_reason)


async def perform_handshake(
    websocket: WebSocket,
    safe_ws: SafeWebSocket
) -> str | None:
    """
    Perform WebSocket handshake and validate client-provided user_id.
    
    Args:
        websocket: Raw WebSocket connection
        safe_ws: Safe WebSocket wrapper
        
    Returns:
        validated client user_id if handshake successful, None otherwise
    """
    try:
        raw_data = await websocket.receive_text()
        handshake_data = await parse_json_object_payload(
            raw_data,
            offload_threshold_bytes=_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES,
            loop_getter=asyncio.get_running_loop,
        )
        handshake_msg = HandshakeMessage.model_validate(handshake_data)
        user_id = handshake_msg.user_id
        
        logger.info(
            "Handshake successful (user_id=%s)",
            user_id,
        )
        return user_id
    except (PydanticValidationError, JsonRootTypeError) as e:
        await _fail_handshake(
            safe_ws=safe_ws,
            error=e,
            close_reason="handshake validation failure",
            validation_error=True,
        )
        return None
    except json.JSONDecodeError as e:
        await _fail_handshake(
            safe_ws=safe_ws,
            error=e,
            close_reason="handshake JSON error",
            validation_error=True,
        )
        return None
    except Exception as e:
        await _fail_handshake(
            safe_ws=safe_ws,
            error=e,
            close_reason="handshake error",
            validation_error=False,
        )
        return None


async def cleanup_connection(
    task_manager: TaskManager,
    session_manager,
    user_id: str,
) -> None:
    """
    Clean up connection resources: cancel tasks and end session.
    
    This is called on both normal disconnect and unexpected errors to ensure
    resources are always cleaned up, preventing leaks.
    
    Args:
        task_manager: Task manager instance
        session_manager: Session manager instance
        user_id: User ID for the connection
    """
    # Clean up tasks
    await task_manager.cleanup(user_id)
    
    # Clean up session - handle exceptions to prevent cleanup failure
    try:
        await session_manager.end_session(user_id)
    except Exception as e:
        logger.error(f"Error ending session for user {user_id}: {e}", exc_info=True)
