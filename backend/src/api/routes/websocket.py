"""
WebSocket API Routes.

This module handles WebSocket connections for real-time communication with the frontend.
Manages message routing, session management, and streaming responses from the agent.
"""
import json
import logging
import asyncio
from typing import Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from pydantic import ValidationError as PydanticValidationError, TypeAdapter

from backend.src.api.deps import get_session_manager, SessionManager
from backend.src.api.handlers import get_handler_registry
from backend.src.api.schema import IncomingMessage, HandshakeMessage
from backend.src.core.validation import ValidationError

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_manager: SessionManager = Depends(get_session_manager)
):
    await websocket.accept()
    user_id = "default_user"
    
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
                    # Use TypeAdapter to validate Union type
                    adapter = TypeAdapter(IncomingMessage)
                    validated_msg = adapter.validate_python(json_data)
                    # Set user_id from connection context
                    validated_msg.user_id = user_id
                    
                    # Route message based on validated type
                    await handle_message(websocket, validated_msg, session_manager, user_id)
                    
                except PydanticValidationError as e:
                    # Validation failed - send error
                    msg_id = json_data.get("id")
                    error_details = "; ".join(
                        f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}"
                        for err in e.errors()
                    )
                    await send_error(websocket, msg_id, f"Invalid message format: {error_details}")
                
            except json.JSONDecodeError:
                await send_error(websocket, None, "Malformed JSON")
            except Exception as e:
                logger.error(f"Error processing message: {e}", exc_info=True)
                await send_error(websocket, None, str(e))
                
    except WebSocketDisconnect:
        logger.info(f"Client {user_id} disconnected")
        await session_manager.end_session(user_id)

async def handle_message(
    websocket: WebSocket, 
    message: IncomingMessage, 
    session_manager: SessionManager,
    user_id: str
):
    """
    Handle incoming WebSocket message using handler registry with type-based routing.
    
    Args:
        websocket: WebSocket connection
        message: Validated Pydantic message object
        session_manager: Session manager instance
        user_id: User ID from connection context
    """
    msg_id = message.id
    msg_type = message.type

    try:
        # Use handler registry to route message based on validated type
        handler_registry = get_handler_registry()
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

async def send_error(websocket: WebSocket, msg_id: str | None, message: str):
    """
    Send error response to WebSocket client.
    
    Args:
        websocket: WebSocket connection
        msg_id: Message ID (optional)
        message: Error message
    """
    await websocket.send_json({
        "type": "error",
        "id": msg_id,
        "payload": {"message": message}
    })

# Legacy handlers removed - now handled by MessageHandlerRegistry (Phase 1)
# See backend/src/api/handlers/ for handler implementations

