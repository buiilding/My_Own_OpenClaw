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
from pydantic import ValidationError

from backend.src.api.deps import get_session_manager, SessionManager
from backend.src.api.handlers import get_handler_registry

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
        if handshake_data.get("type") == "handshake":
            user_id = handshake_data.get("user_id", "default_user")
            logger.info(f"Handshake successful for user {user_id}")
        else:
            logger.warning("Handshake failed")
            await websocket.close(code=1008)
            return
    except Exception as e:
        logger.error(f"Handshake error: {e}")
        await websocket.close(code=1008)
        return

    # Main Loop
    try:
        while True:
            data = await websocket.receive_text()
            try:
                json_data = json.loads(data)
                # Inject user_id if missing, or just use it for context
                json_data["user_id"] = user_id
                
                # Route message
                await handle_message(websocket, json_data, session_manager, user_id)
                
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
    data: Dict[str, Any], 
    session_manager: SessionManager,
    user_id: str
):
    """
    Handle incoming WebSocket message using handler registry (Phase 1).
    
    Args:
        websocket: WebSocket connection
        data: Message data dictionary
        session_manager: Session manager instance
        user_id: User ID from connection context
    """
    msg_type = data.get("type")
    msg_id = data.get("id")

    try:
        # Validate message structure
        if not msg_type:
            await send_error(websocket, msg_id, "Message type is required")
            return
        
        # Use handler registry to route message (Phase 1)
        handler_registry = get_handler_registry()
        await handler_registry.handle(msg_type, data, websocket, user_id)
    
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

