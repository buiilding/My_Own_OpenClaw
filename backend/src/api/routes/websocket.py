"""
WebSocket API Routes.

This module handles WebSocket connections for real-time communication with the frontend.
Manages message routing, session management, and streaming responses from the agent.

Connection Lifecycle:
1. Client connects → handshake (user_id exchange)
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
import json
import logging
import asyncio
from typing import Any, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError as PydanticValidationError, TypeAdapter

from backend.src.api.deps import (
    HandlerRegistryDep,
    SessionManagerDep,
)
from backend.src.api.core.base import MessageHandlerRegistry
from backend.src.api.core.errors import send_error_response, sanitize_error_message
from backend.src.api.core.transport import WebSocketSender
from backend.src.api.core.websocket_sender import SafeWebSocket
from backend.src.api.schema import IncomingMessage, HandshakeMessage

router = APIRouter()
logger = logging.getLogger(__name__)

# Create TypeAdapter once at module level for performance
_INCOMING_MESSAGE_ADAPTER = TypeAdapter(IncomingMessage)

# DEPRECATED: These constants are now in AppConfig
# Kept for backward compatibility during migration
# TODO: Remove after all references are updated to use config
MAX_MESSAGE_SIZE = 10 * 1024 * 1024  # 10MB - maximum message size to prevent memory exhaustion attacks
TASK_CANCELLATION_TIMEOUT = 5.0  # Seconds to wait for tasks to cancel on disconnect
MAX_CONCURRENT_TASKS = 50  # Maximum concurrent tasks per connection to prevent DoS
WEBSOCKET_RECEIVE_TIMEOUT = 3600.0  # 1 hour - timeout for receive operations


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_manager: SessionManagerDep,
    handler_registry: HandlerRegistryDep,
):
    safe_ws = SafeWebSocket(websocket)
    await safe_ws.accept()
    
    # Get config values (moved from hardcoded constants to AppConfig)
    config = session_manager.config
    max_message_size = config.websocket_max_message_size
    max_concurrent_tasks = config.websocket_max_concurrent_tasks
    websocket_receive_timeout = config.websocket_receive_timeout
    task_cancellation_timeout = config.websocket_task_cancellation_timeout
    
    # Track active tasks for this connection to cancel on disconnect
    # Use lock to prevent race conditions when multiple tasks modify the set concurrently
    active_tasks: set[asyncio.Task] = set()
    tasks_lock = asyncio.Lock()
    
    async def _remove_task_safely(task: asyncio.Task) -> None:
        """
        Remove task from active set with lock protection.
        
        This coroutine is scheduled from the task_done_callback to ensure
        thread-safe removal that doesn't race with disconnect cleanup iteration.
        """
        async with tasks_lock:
            active_tasks.discard(task)
    
    def task_done_callback(task: asyncio.Task):
        """
        Remove task from active set when done.
        
        NOTE: This callback runs synchronously from the task's context.
        To prevent race conditions with disconnect cleanup iteration, we schedule
        a coroutine to remove the task with proper lock protection.
        """
        # Schedule removal with lock protection to prevent race with iteration
        # The callback runs in the task's context (same event loop), so we can schedule
        try:
            # Get the running event loop (should be available since callback runs from task)
            loop = asyncio.get_running_loop()
            # Schedule the async removal function as a task
            # This ensures the lock is properly acquired before modifying the set
            loop.create_task(_remove_task_safely(task))
        except RuntimeError:
            # SHUTDOWN CRASH FIX: During shutdown, loop may be closed/closing.
            # Fallback discard must be protected to prevent "Set changed size during iteration"
            # errors if _cleanup_connection is iterating. Wrap in try/except to handle
            # any RuntimeError from set mutation during iteration.
            try:
                active_tasks.discard(task)
            except RuntimeError:
                # Set is being iterated - ignore (cleanup will handle it)
                pass
    
    # Handshake - user_id validation handled by Pydantic model
    try:
        raw_data = await websocket.receive_text()
        # CRITICAL FIX #5: Offload JSON parsing to thread pool (handshake is typically small, but consistent)
        loop = asyncio.get_running_loop()
        handshake_data = await loop.run_in_executor(None, json.loads, raw_data)
        handshake_msg = HandshakeMessage.model_validate(handshake_data)
        user_id = handshake_msg.user_id
        
        logger.info(f"Handshake successful for user {user_id}")
    except PydanticValidationError as e:
        logger.warning(f"Handshake validation failed: {e}")
        try:
            await safe_ws.close(code=1008)  # Policy Violation
        except Exception as close_error:
            logger.debug(f"Error closing WebSocket after handshake validation failure: {close_error}")
        return
    except json.JSONDecodeError as e:
        logger.warning(f"Handshake JSON decode failed: {e}")
        try:
            await safe_ws.close(code=1008)  # Policy Violation
        except Exception as close_error:
            logger.debug(f"Error closing WebSocket after handshake JSON error: {close_error}")
        return
    except Exception as e:
        logger.error(f"Handshake error: {e}")
        try:
            await safe_ws.close(code=1008)  # Policy Violation
        except Exception as close_error:
            logger.debug(f"Error closing WebSocket after handshake error: {close_error}")
        return

    # Helper function to perform cleanup (used for both disconnect and error cases)
    async def _cleanup_connection() -> None:
        """
        Clean up connection resources: cancel tasks and end session.
        
        This is called on both normal disconnect and unexpected errors to ensure
        resources are always cleaned up, preventing leaks.
        """
        # Get snapshot of pending tasks with lock to avoid race condition
        async with tasks_lock:
            pending = [t for t in active_tasks if not t.done()]
        
        # Cancel all pending tasks
        for task in pending:
            task.cancel()
        
        # Wait for handlers to react to CancelledError
        if pending:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*pending, return_exceptions=True),
                    timeout=task_cancellation_timeout
                )
            except asyncio.TimeoutError:
                logger.warning(f"Timeout waiting for {len(pending)} tasks to cancel")
        
        # Force check for zombies (tasks that didn't respond to cancellation)
        zombies = [t for t in pending if not t.done()]
        if zombies:
            logger.error(f"Orphaned {len(zombies)} tasks after cleanup for user {user_id}")
        
        # Clean up session - handle exceptions to prevent cleanup failure
        try:
            await session_manager.end_session(user_id)
        except Exception as e:
            logger.error(f"Error ending session for user {user_id}: {e}", exc_info=True)

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
                    await _cleanup_connection()
                break
            
            # SECURITY: Validate message size after receiving
            # CRITICAL: This check happens AFTER the entire frame is read into memory.
            # For true DoS protection, the ASGI server (e.g., Uvicorn) MUST be configured
            # with --ws-max-size to reject oversized frames at the protocol level BEFORE
            # they are read into Python memory. This application-level check is a secondary
            # defense but cannot prevent OOM if a malicious client sends a 1GB payload.
            # 
            # Example Uvicorn configuration:
            #   uvicorn.run(..., ws_max_size=10 * 1024 * 1024)  # 10MB
            #
            # Without protocol-level protection, a 1GB frame will cause OOM before this
            # check executes, potentially crashing the worker process.
            if len(data) > max_message_size:
                await send_error(safe_ws, None, f"Message too large: {len(data)} bytes (max: {max_message_size} bytes)")
                continue
            
            try:
                # PERFORMANCE: Offload large JSON parsing to thread pool
                # With max_message_size (default 10MB), parsing can block the event loop
                # for 50-200ms, causing jitter for all other connected clients
                # (e.g., stalling audio streams)
                loop = asyncio.get_running_loop()
                json_data = await loop.run_in_executor(None, json.loads, data)
                
                # Inject user_id from connection context BEFORE validation
                # BaseMessage requires user_id, but it comes from connection context, not client JSON
                json_data["user_id"] = user_id
                
                # Validate and parse message using Pydantic
                try:
                    # Use pre-created TypeAdapter for performance
                    validated_msg = _INCOMING_MESSAGE_ADAPTER.validate_python(json_data)
                    
                    # Concurrency Limit - Prevent DoS via task explosion
                    # Check concurrency limit and create task atomically to prevent race condition
                    msg_id_for_error = None
                    task = None
                    async with tasks_lock:
                        if len(active_tasks) >= max_concurrent_tasks:
                            # Mark for error, release lock before I/O
                            msg_id_for_error = json_data.get("id")
                        else:
                            # Create task and add to set atomically within lock
                            task = asyncio.create_task(handle_message(safe_ws, validated_msg, handler_registry, user_id))
                            active_tasks.add(task)
                            task.add_done_callback(task_done_callback)
                    
                    # Send error outside lock to avoid blocking (if limit exceeded)
                    if msg_id_for_error is not None:
                        logger.warning(f"User {user_id} exceeded max concurrent tasks ({max_concurrent_tasks})")
                        await send_error(safe_ws, msg_id_for_error, "Too many concurrent requests. Please wait.")
                        continue
                    
                    # Task already created and added above - continue to next message
                    
                except PydanticValidationError as e:
                    # Validation failed - send error using canonical utility
                    msg_id = json_data.get("id")
                    error_details = "; ".join(
                        f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}"
                        for err in e.errors()
                    )
                    await send_error(safe_ws, msg_id, f"Invalid message format: {error_details}")
                
            except json.JSONDecodeError:
                # Malformed JSON - send error using canonical utility
                await send_error(safe_ws, None, "Malformed JSON")
            except Exception as e:
                # Unexpected error - send sanitized error to prevent information leakage
                # Full details are logged server-side via send_error
                await send_error(safe_ws, None, None, exception=e)
                
    except WebSocketDisconnect:
        logger.info(f"Client {user_id} disconnected")
        await _cleanup_connection()
    except Exception as e:
        # Handle unexpected exceptions (e.g., KeyboardInterrupt, SystemError) to ensure cleanup
        # This prevents resource leaks when unexpected errors occur
        logger.error(f"Unexpected error in WebSocket loop for user {user_id}: {e}", exc_info=True)
        await _cleanup_connection()
        # Re-raise to let FastAPI handle it appropriately
        raise

async def handle_message(
    websocket: SafeWebSocket, 
    message: IncomingMessage, 
    handler_registry: MessageHandlerRegistry,
    user_id: str
):
    """
    Handle incoming WebSocket message using handler registry with type-based routing.
    
    RELIABILITY: This function is executed as a tracked task. If handlers spawn
    background sub-tasks (e.g., via asyncio.create_task()), they MUST be:
    1. Attached to the AgentSession for cleanup in session.cleanup(), OR
    2. Tracked in a session-scoped task registry, OR
    3. Created with a cancellation token that can be triggered on disconnect.
    
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

# Legacy handlers removed - now handled by MessageHandlerRegistry (Phase 1)
# See backend/src/api/handlers/ for handler implementations

