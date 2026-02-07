"""
WebSocket API Routes.

This module handles WebSocket connections for real-time communication with the frontend.
Manages message routing, session management, and streaming responses from the agent.

Connection Lifecycle:
1. Client connects → handshake (server assigns user_id)
2. Message loop → receive, validate, route to handler
3. Handler processes → may spawn background tasks (TTS streaming)
4. Client disconnects → cleanup tasks, end session

Message Processing:
- Messages are validated via Pydantic (schema.py)
- Each message spawns a task to avoid blocking the receive loop
- Tasks are tracked and cancelled on disconnect
- SafeWebSocket wrapper ensures thread-safe sending

Error Handling:
- Validation errors → send error response to client
- Handler errors → log and send error response
- Connection errors → log at debug level (expected on disconnect)
"""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.src.api.deps import (
    HandlerRegistryDep,
    SessionManagerDep,
)
from backend.src.api.transport.websocket import SafeWebSocket
from backend.src.api.routes.websocket.connection import (
    perform_handshake,
    cleanup_connection,
)
from backend.src.api.routes.websocket.message_handler import (
    parse_and_validate_message,
    handle_message,
    send_error,
)
from backend.src.api.routes.websocket.task_manager import TaskManager

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_manager: SessionManagerDep,
    handler_registry: HandlerRegistryDep,
):
    """
    WebSocket endpoint for real-time communication.
    
    Handles connection lifecycle, message routing, and cleanup.
    """
    safe_ws = SafeWebSocket(websocket)
    await safe_ws.accept()
    
    # Get config values (moved from hardcoded constants to AppConfig)
    config = session_manager.config
    max_message_size = config.websocket_max_message_size
    max_concurrent_tasks = config.websocket_max_concurrent_tasks
    websocket_receive_timeout = config.websocket_receive_timeout
    task_cancellation_timeout = config.websocket_task_cancellation_timeout
    
    # Initialize task manager
    task_manager = TaskManager(max_concurrent_tasks, task_cancellation_timeout)
    
    # Perform handshake
    user_id = await perform_handshake(websocket, safe_ws)
    if not user_id:
        return  # Handshake failed, connection already closed
    
    # Main Loop
    try:
        while True:
            # Add timeout to prevent resource exhaustion (Slowloris attack vector)
            # Clients that never send data will timeout and be disconnected
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=websocket_receive_timeout
                )
            except asyncio.TimeoutError:
                logger.info(f"Connection timeout for user {user_id} (no data received in {websocket_receive_timeout}s)")
                try:
                    await safe_ws.close(code=1008, reason="Connection timeout - no data received")
                except Exception:
                    pass  # Connection may already be closed
                finally:
                    # Clean up session on timeout to prevent orphaned sessions
                    await cleanup_connection(task_manager, session_manager, user_id)
                break
            
            # Parse and validate message
            validated_msg, error_msg = await parse_and_validate_message(
                data, user_id, max_message_size
            )
            
            if error_msg:
                await send_error(safe_ws, None, error_msg)
                continue
            
            if not validated_msg:
                continue  # Should not happen, but handle gracefully
            
            # Check concurrency limit and create task
            msg_id = validated_msg.id
            task, limit_exceeded = await task_manager.create_task_if_under_limit(
                handle_message(safe_ws, validated_msg, handler_registry, user_id),
                user_id
            )
            
            if limit_exceeded:
                logger.warning(f"User {user_id} exceeded max concurrent tasks ({max_concurrent_tasks})")
                await send_error(safe_ws, msg_id, "Too many concurrent requests. Please wait.")
                continue
            
            # Task created and added - continue to next message
                
    except WebSocketDisconnect:
        logger.info(f"Client {user_id} disconnected")
        await cleanup_connection(task_manager, session_manager, user_id)
    except Exception as e:
        # Handle unexpected exceptions (e.g., KeyboardInterrupt, SystemError) to ensure cleanup
        # This prevents resource leaks when unexpected errors occur
        logger.error(f"Unexpected error in WebSocket loop for user {user_id}: {e}", exc_info=True)
        await cleanup_connection(task_manager, session_manager, user_id)
        # Re-raise to let FastAPI handle it appropriately
        raise
