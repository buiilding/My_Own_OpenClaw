"""
Connection Lifecycle Management for WebSocket Routes.

Handles handshake, connection setup, and cleanup.
"""
import json
import logging
import asyncio
import uuid

from fastapi import WebSocket
from pydantic import ValidationError as PydanticValidationError

from backend.src.api.transport.websocket import SafeWebSocket
from backend.src.api.schema import HandshakeMessage
from backend.src.api.routes.websocket.task_manager import TaskManager

logger = logging.getLogger(__name__)


async def _close_policy_violation(safe_ws: SafeWebSocket, reason: str) -> None:
    """Close websocket with policy-violation code and swallow close failures."""
    try:
        await safe_ws.close(code=1008)  # Policy Violation
    except Exception as close_error:
        logger.debug(f"Error closing WebSocket after {reason}: {close_error}")


async def perform_handshake(
    websocket: WebSocket,
    safe_ws: SafeWebSocket
) -> str | None:
    """
    Perform WebSocket handshake and assign server-side user_id.
    
    Args:
        websocket: Raw WebSocket connection
        safe_ws: Safe WebSocket wrapper
        
    Returns:
        server-assigned user_id if handshake successful, None otherwise
    """
    try:
        raw_data = await websocket.receive_text()
        # CRITICAL FIX #5: Offload JSON parsing to thread pool (handshake is typically small, but consistent)
        loop = asyncio.get_running_loop()
        handshake_data = await loop.run_in_executor(None, json.loads, raw_data)
        handshake_msg = HandshakeMessage.model_validate(handshake_data)
        client_user_id = handshake_msg.user_id
        server_user_id = f"user_{uuid.uuid4().hex}"
        
        logger.info(
            "Handshake successful (client_user_id=%s, assigned_user_id=%s)",
            client_user_id,
            server_user_id,
        )
        return server_user_id
    except PydanticValidationError as e:
        logger.warning(f"Handshake validation failed: {e}")
        await _close_policy_violation(safe_ws, "handshake validation failure")
        return None
    except json.JSONDecodeError as e:
        logger.warning(f"Handshake JSON decode failed: {e}")
        await _close_policy_violation(safe_ws, "handshake JSON error")
        return None
    except Exception as e:
        logger.error(f"Handshake error: {e}")
        await _close_policy_violation(safe_ws, "handshake error")
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
