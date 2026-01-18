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
from typing import Dict, Any, Union

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from pydantic import ValidationError as PydanticValidationError, TypeAdapter

from backend.src.api.deps import (
    HandlerRegistryDep,
    SessionManagerDep,
)
from backend.src.api.handlers.base import MessageHandlerRegistry
from backend.src.api.schema import IncomingMessage, HandshakeMessage
from backend.src.core.validation import ValidationError

router = APIRouter()
logger = logging.getLogger(__name__)

# Create TypeAdapter once at module level for performance
_INCOMING_MESSAGE_ADAPTER = TypeAdapter(IncomingMessage)

class SafeWebSocket:
    """
    Thread-safe/coroutine-safe WebSocket wrapper.
    
    WebSocket operations in FastAPI/Starlette are not safe for concurrent access.
    This wrapper serializes all send operations using an asyncio.Lock to prevent
    race conditions when multiple coroutines attempt to send simultaneously.
    
    The lock is necessary because:
    - Multiple handlers may send responses concurrently
    - Background tasks (e.g., TTS audio streaming) may send while handlers send
    - Without serialization, concurrent sends can corrupt the WebSocket protocol
    
    Performance impact is minimal since WebSocket sends are I/O-bound and the lock
    is held only during the actual send operation.
    """
    def __init__(self, websocket: WebSocket):
        """
        Initialize the safe WebSocket wrapper.
        
        Args:
            websocket: Underlying WebSocket connection
        """
        self._websocket = websocket
        self._lock = asyncio.Lock()

    async def send_json(self, data: Any, **kwargs):
        """
        Send JSON data with serialized access and error handling.
        
        Args:
            data: JSON-serializable data to send
            **kwargs: Additional arguments passed to underlying send_json
            
        Raises:
            WebSocketDisconnect: If connection is closed
            RuntimeError: If connection error occurs
            ConnectionError: If connection error occurs
        """
        async with self._lock:
            try:
                await self._websocket.send_json(data, **kwargs)
            except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                logger.debug(f"Failed to send JSON to closed connection: {e}")
                raise

    async def send_text(self, data: str, **kwargs):
        """
        Send text data with serialized access and error handling.
        
        Args:
            data: Text data to send
            **kwargs: Additional arguments passed to underlying send_text
            
        Raises:
            WebSocketDisconnect: If connection is closed
            RuntimeError: If connection error occurs
            ConnectionError: If connection error occurs
        """
        async with self._lock:
            try:
                await self._websocket.send_text(data, **kwargs)
            except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                logger.debug(f"Failed to send text to closed connection: {e}")
                raise

    def __getattr__(self, name):
        """Delegate attribute access to underlying WebSocket."""
        return getattr(self._websocket, name)

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_manager: SessionManagerDep,
    handler_registry: HandlerRegistryDep,
):
    await websocket.accept()
    safe_ws = SafeWebSocket(websocket)
    user_id = "default_user"
    
    # Track active tasks for this connection to cancel on disconnect
    active_tasks: set[asyncio.Task] = set()
    
    def task_done_callback(task: asyncio.Task):
        """Remove task from active set when done."""
        active_tasks.discard(task)
    
    # Handshake
    try:
        handshake_data = await websocket.receive_json()
        handshake_msg = HandshakeMessage.model_validate(handshake_data)
        user_id = handshake_msg.user_id
        logger.info(f"Handshake successful for user {user_id}")
    except PydanticValidationError as e:
        logger.warning(f"Handshake validation failed: {e}")
        try:
            await websocket.close(code=1008)
        except AttributeError as close_error:
            # Ignore AttributeError during WebSocket cleanup (websockets library internal issue)
            if "transfer_data_task" not in str(close_error):
                logger.warning(f"Error closing WebSocket after handshake validation failure: {close_error}")
        except Exception as close_error:
            logger.warning(f"Error closing WebSocket after handshake validation failure: {close_error}")
        return
    except Exception as e:
        logger.error(f"Handshake error: {e}")
        try:
            await websocket.close(code=1008)
        except AttributeError as close_error:
            # Ignore AttributeError during WebSocket cleanup (websockets library internal issue)
            if "transfer_data_task" not in str(close_error):
                logger.warning(f"Error closing WebSocket after handshake error: {close_error}")
        except Exception as close_error:
            logger.warning(f"Error closing WebSocket after handshake error: {close_error}")
        return

    # Main Loop
    try:
        while True:
            data = await websocket.receive_text()
            try:
                json_data = json.loads(data)
                
                # Validate and parse message using Pydantic
                try:
                    # Use pre-created TypeAdapter for performance
                    validated_msg = _INCOMING_MESSAGE_ADAPTER.validate_python(json_data)
                    # Set user_id from connection context
                    validated_msg.user_id = user_id
                    
                    # Route message based on validated type
                    # We spawn a task to avoid blocking the receiving loop.
                    # This is essential for handlers that wait for other messages (like tool-result).
                    # Track task to cancel on disconnect
                    task = asyncio.create_task(handle_message(safe_ws, validated_msg, handler_registry, user_id))
                    active_tasks.add(task)
                    task.add_done_callback(task_done_callback)
                    
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
                # Unexpected error - log and send error using canonical utility
                logger.error(f"Error processing message: {e}", exc_info=True)
                await send_error(safe_ws, None, str(e))
                
    except WebSocketDisconnect:
        logger.info(f"Client {user_id} disconnected")
        # Cancel all active tasks for this connection
        for task in active_tasks:
            if not task.done():
                task.cancel()
        # Wait briefly for tasks to cancel (non-blocking)
        if active_tasks:
            await asyncio.gather(*active_tasks, return_exceptions=True)
        await session_manager.end_session(user_id)

async def handle_message(
    websocket: Union[WebSocket, SafeWebSocket], 
    message: IncomingMessage, 
    handler_registry: MessageHandlerRegistry,
    user_id: str
):
    """
    Handle incoming WebSocket message using handler registry with type-based routing.
    
    Args:
        websocket: WebSocket connection
        message: Validated Pydantic message object
        handler_registry: Message handler registry instance
        user_id: User ID from connection context
    """
    msg_id = message.id
    msg_type = message.type

    try:
        # Use handler registry to route message based on validated type
        # Convert Pydantic model to dict for handler (handlers still expect dict for now)
        # TODO: Refactor handlers to accept typed messages in future phase
        message_dict = message.model_dump()
        await handler_registry.handle(msg_type, message_dict, websocket, user_id)
    
    except ValueError as e:
        # Handler not found or validation error
        await send_error(websocket, msg_id, str(e))
    except Exception as e:
        logger.error(f"Unexpected error handling message: {e}", exc_info=True)
        await send_error(websocket, msg_id, f"Internal error: {str(e)}")

async def send_error(websocket: Union[WebSocket, SafeWebSocket], msg_id: str | None, message: str):
    """
    Send error response to WebSocket client.
    
    Delegates to error_utils.send_error_response to ensure canonical error payload shape.
    This is the ONLY way errors should be sent from the WebSocket route layer.
    
    Args:
        websocket: WebSocket connection (WebSocket or SafeWebSocket)
        msg_id: Message ID (optional)
        message: Error message
    """
    from backend.src.api.handlers.error_utils import send_error_response
    # SafeWebSocket is a wrapper, but send_error_response expects WebSocket
    # Extract underlying websocket if needed
    actual_ws = websocket._websocket if isinstance(websocket, SafeWebSocket) else websocket
    await send_error_response(actual_ws, msg_id, message)

# Legacy handlers removed - now handled by MessageHandlerRegistry (Phase 1)
# See backend/src/api/handlers/ for handler implementations

