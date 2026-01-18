"""
WebSocket API Routes.

This module handles WebSocket connections for real-time communication with the frontend.
Manages message routing, session management, and streaming responses from the agent.
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
    """Wrapper for WebSocket to ensure thread-safe/coroutine-safe sending."""
    def __init__(self, websocket: WebSocket):
        self._websocket = websocket
        self._lock = asyncio.Lock()

    async def send_json(self, data: Any, **kwargs):
        """Send JSON data with error handling for closed connections."""
        async with self._lock:
            try:
                await self._websocket.send_json(data, **kwargs)
            except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                logger.debug(f"Failed to send JSON to closed connection: {e}")
                raise

    async def send_text(self, data: str, **kwargs):
        """Send text data with error handling for closed connections."""
        async with self._lock:
            try:
                await self._websocket.send_text(data, **kwargs)
            except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                logger.debug(f"Failed to send text to closed connection: {e}")
                raise

    def __getattr__(self, name):
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
                    # Validation failed - send error
                    msg_id = json_data.get("id")
                    error_details = "; ".join(
                        f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}"
                        for err in e.errors()
                    )
                    await send_error(safe_ws, msg_id, f"Invalid message format: {error_details}")
                
            except json.JSONDecodeError:
                await send_error(safe_ws, None, "Malformed JSON")
            except Exception as e:
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
    
    Handles connection errors gracefully - if connection is closed, logs and returns silently.
    
    Args:
        websocket: WebSocket connection (WebSocket or SafeWebSocket)
        msg_id: Message ID (optional)
        message: Error message
    """
    try:
        if isinstance(websocket, SafeWebSocket):
            await websocket.send_json({
                "type": "error",
                "id": msg_id,
                "payload": {"message": message}
            })
        else:
            await websocket.send_json({
                "type": "error",
                "id": msg_id,
                "payload": {"message": message}
            })
    except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
        # Connection closed - this is expected in some cases, log at debug level
        logger.debug(f"Failed to send error message to closed connection: {e}")

# Legacy handlers removed - now handled by MessageHandlerRegistry (Phase 1)
# See backend/src/api/handlers/ for handler implementations

