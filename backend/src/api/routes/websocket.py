import json
import logging
import asyncio
from typing import Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from pydantic import ValidationError

from backend.src.api.deps import get_session_manager, SessionManager
from backend.src.api.schema import (
    IncomingMessage,
    PingMessage,
    QueryMessage,
    LoadSettingsMessage,
    ListModelsMessage,
    UpdateSettingsMessage,
    ErrorResponse,
    ErrorPayload
)
from backend.src.core.config import get_settings, AppConfig, get_config_dir, CONFIG_FILE_NAME
from backend.src.brain.llm.model_registry import get_all_models
import yaml

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
    msg_type = data.get("type")
    msg_id = data.get("id")

    if msg_type == "ping":
        await websocket.send_json({
            "type": "pong",
            "id": msg_id,
            "payload": {"text": data.get("payload", {}).get("text", "Pong")}
        })
    
    elif msg_type == "query":
        await handle_query(websocket, data, session_manager, user_id)
        
    elif msg_type == "load-settings":
        config_payload = get_settings().model_dump(exclude={"api_key"})
        await websocket.send_json({
            "type": "settings-loaded",
            "id": msg_id,
            "payload": config_payload
        })
        
    elif msg_type == "list-models":
        models = await get_all_models()
        await websocket.send_json({
            "type": "models-listed",
            "id": msg_id,
            "payload": models
        })
        
    elif msg_type == "update-settings":
        await handle_update_settings(websocket, data, session_manager)
        
    else:
        await send_error(websocket, msg_id, f"Unknown message type: {msg_type}")

async def send_error(websocket: WebSocket, msg_id: str | None, message: str):
    await websocket.send_json({
        "type": "error",
        "id": msg_id,
        "payload": {"message": message}
    })

# Handlers

async def handle_query(
    websocket: WebSocket, 
    data: Dict[str, Any], 
    session_manager: SessionManager,
    user_id: str
):
    msg_id = data.get("id")
    query_text = data.get("payload", {}).get("text", "")
    
    if not query_text.strip():
        await send_error(websocket, msg_id, "Query text cannot be empty")
        return

    agent_instance = await session_manager.get_or_create_session(user_id)
    
    try:
        async for event in agent_instance.process_query(query_text):
            response = None
            if event["type"] == "thinking":
                response = {
                    "type": "llm-thought",
                    "id": msg_id,
                    "payload": {"status": event["content"]}
                }
            elif event["type"] == "chunk":
                response = {
                    "type": "streaming-response",
                    "id": msg_id,
                    "payload": {"text": event["content"]}
                }
            elif event["type"] == "error":
                response = {
                    "type": "error",
                    "id": msg_id,
                    "payload": {"content": event.get("content", "Error")}
                }
            elif event["type"] == "streaming-complete":
                 response = {
                    "type": "streaming-complete",
                    "id": msg_id,
                    "payload": {}
                }
            elif event["type"] == "tool_call":
                 response = {
                    "type": "tool-call",
                    "id": msg_id,
                    "payload": {
                        "tool_name": event.get("tool_name"),
                        "parameters": event.get("parameters"),
                        "raw_call": event.get("raw_call"),
                    }
                }
            elif event["type"] == "tool_output":
                 response = {
                    "type": "tool-output",
                    "id": msg_id,
                    "payload": {
                        "tool_name": event.get("tool_name"),
                        "success": event.get("success"),
                        "execution_time": event.get("execution_time"),
                        "output": event.get("output"),
                        "error": event.get("error"),
                        "screenshot": event.get("screenshot")
                    }
                }
            
            if response:
                await websocket.send_json(response)
                
        # Final complete message if not sent
        await websocket.send_json({
            "type": "streaming-complete",
            "id": msg_id,
            "payload": {}
        })

    except Exception as e:
        logger.error(f"Error in query processing: {e}", exc_info=True)
        await send_error(websocket, msg_id, str(e))


async def handle_update_settings(
    websocket: WebSocket, 
    data: Dict[str, Any],
    session_manager: SessionManager
):
    msg_id = data.get("id")
    try:
        new_config_data = data.get("payload", {})
        current_settings = get_settings()
        
        # Merge and validate
        merged_data = {**current_settings.model_dump(), **new_config_data}
        validated_config = AppConfig(**merged_data)
        
        # Load API Key
        from backend.src.core.config import load_api_key_for_provider
        load_api_key_for_provider(validated_config)
        
        # Update Sessions (Container is updated via SessionManager)
        await session_manager.update_all_sessions_config(validated_config)
        
        # Save to File
        config_dir = get_config_dir()
        config_file = config_dir / CONFIG_FILE_NAME
        config_dir.mkdir(parents=True, exist_ok=True)
        
        with open(config_file, "w", encoding="utf-8") as f:
            config_to_save = validated_config.model_dump(exclude={"api_key"})
            yaml.dump(config_to_save, f, default_flow_style=False, sort_keys=False)
            
        await websocket.send_json({
            "type": "settings-updated",
            "id": msg_id,
            "payload": {"message": "Settings updated successfully"}
        })
        
    except Exception as e:
        logger.error(f"Failed to update settings: {e}", exc_info=True)
        await send_error(websocket, msg_id, f"Failed to update settings: {str(e)}")

