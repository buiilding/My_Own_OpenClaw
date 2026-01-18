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
from backend.src.api.handlers.base import MessageHandlerRegistry
from backend.src.api.handlers.error_utils import send_error_response, sanitize_error_message
from backend.src.api.handlers.transport import WebSocketSender
from backend.src.api.schema import IncomingMessage, HandshakeMessage

router = APIRouter()
logger = logging.getLogger(__name__)

# Create TypeAdapter once at module level for performance
_INCOMING_MESSAGE_ADAPTER = TypeAdapter(IncomingMessage)

# Constants
MAX_MESSAGE_SIZE = 10 * 1024 * 1024  # 10MB - maximum message size to prevent memory exhaustion attacks
TASK_CANCELLATION_TIMEOUT = 5.0  # Seconds to wait for tasks to cancel on disconnect
MAX_CONCURRENT_TASKS = 50  # FIX #1: Maximum concurrent tasks per connection to prevent DoS
WEBSOCKET_RECEIVE_TIMEOUT = 300.0  # 5 minutes - timeout for receive operations to prevent resource exhaustion


class SafeWebSocket:
    """
    Thread-safe WebSocket wrapper implementing WebSocketSender Protocol.
    
    WebSocket operations in FastAPI/Starlette are not safe for concurrent access.
    This wrapper serializes all send operations using an asyncio.Lock to prevent
    race conditions when multiple coroutines attempt to send simultaneously.
    
    The lock is necessary because:
    - Multiple handlers may send responses concurrently
    - Background tasks (e.g., TTS audio streaming) may send while handlers send
    - Without serialization, concurrent sends can corrupt the WebSocket protocol
    
    Implements WebSocketSender Protocol to ensure type safety and enforce
    thread-safe usage throughout the codebase.
    """
    
    def __init__(self, websocket: WebSocket):
        """
        Initialize the safe WebSocket wrapper.
        
        Args:
            websocket: Underlying WebSocket connection
        """
        self._websocket = websocket
        self._lock = asyncio.Lock()

    async def send_json(self, data: Any, mode: str = "text") -> None:
        """
        Thread-safe JSON send.
        
        Args:
            data: JSON-serializable data to send
            mode: Send mode (default: "text")
            
        Raises:
            RuntimeError: If connection error occurs
            ConnectionError: If connection error occurs
        """
        async with self._lock:
            try:
                await self._websocket.send_json(data, mode=mode)
            except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                logger.debug(f"Send failed (connection closed): {e}")
                # We raise to let the caller know the stream is dead
                raise

    async def send_text(self, data: str) -> None:
        """
        Thread-safe text send.
        
        Args:
            data: Text data to send
            
        Raises:
            RuntimeError: If connection error occurs
            ConnectionError: If connection error occurs
        """
        async with self._lock:
            try:
                await self._websocket.send_text(data)
            except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                logger.debug(f"Send failed (connection closed): {e}")
                raise

    async def close(self, code: int = 1000, reason: Optional[str] = None) -> None:
        """
        Thread-safe close.
        
        Args:
            code: Close code (default: 1000)
            reason: Optional close reason
        """
        async with self._lock:
            try:
                await self._websocket.close(code=code, reason=reason)
            except Exception as e:
                logger.debug(f"Close failed (already closed): {e}")

    async def accept(self) -> None:
        """
        Accept connection (usually called before locking matters).
        """
        await self._websocket.accept()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_manager: SessionManagerDep,
    handler_registry: HandlerRegistryDep,
):
    safe_ws = SafeWebSocket(websocket)
    await safe_ws.accept()
    
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
            # Edge case: no running loop (shouldn't happen in normal operation)
            # Fall back to direct removal - this is safe for single operations
            # but may race with iteration (acceptable in shutdown scenarios)
            active_tasks.discard(task)
    
    # Handshake - FIX: Strict validation, reject default_user and empty user_id
    try:
        raw_data = await websocket.receive_text()
        handshake_data = json.loads(raw_data)
        handshake_msg = HandshakeMessage.model_validate(handshake_data)
        user_id = handshake_msg.user_id
        
        # FIX: Strict rejection. Do not fallback to default_user.
        if not user_id or user_id == "default_user":
            logger.warning(f"Invalid user_id in handshake: {user_id}")
            await safe_ws.close(code=4003)  # Forbidden
            return
            
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
                    timeout=TASK_CANCELLATION_TIMEOUT
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
                    timeout=WEBSOCKET_RECEIVE_TIMEOUT
                )
            except asyncio.TimeoutError:
                logger.info(f"Connection timeout for user {user_id} (no data received in {WEBSOCKET_RECEIVE_TIMEOUT}s)")
                try:
                    await safe_ws.close(code=1008, reason="Connection timeout - no data received")
                except Exception:
                    pass  # Connection may already be closed
                finally:
                    # Clean up session on timeout to prevent orphaned sessions
                    await _cleanup_connection()
                break
            
            # Validate message size before processing
            if len(data) > MAX_MESSAGE_SIZE:
                await send_error(safe_ws, None, f"Message too large: {len(data)} bytes (max: {MAX_MESSAGE_SIZE} bytes)")
                continue
            
            try:
                json_data = json.loads(data)
                
                # Validate and parse message using Pydantic
                try:
                    # Use pre-created TypeAdapter for performance
                    validated_msg = _INCOMING_MESSAGE_ADAPTER.validate_python(json_data)
                    # Set user_id from connection context using model_copy to avoid mutation
                    validated_msg = validated_msg.model_copy(update={"user_id": user_id})
                    
                    # FIX #1: Concurrency Limit - Prevent DoS via task explosion
                    # Check concurrency limit and create task atomically to prevent race condition
                    msg_id_for_error = None
                    task = None
                    async with tasks_lock:
                        if len(active_tasks) >= MAX_CONCURRENT_TASKS:
                            # Mark for error, release lock before I/O
                            msg_id_for_error = json_data.get("id")
                        else:
                            # Create task and add to set atomically within lock
                            task = asyncio.create_task(handle_message(safe_ws, validated_msg, handler_registry, user_id))
                            active_tasks.add(task)
                            task.add_done_callback(task_done_callback)
                    
                    # Send error outside lock to avoid blocking (if limit exceeded)
                    if msg_id_for_error is not None:
                        logger.warning(f"User {user_id} exceeded max concurrent tasks ({MAX_CONCURRENT_TASKS})")
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

