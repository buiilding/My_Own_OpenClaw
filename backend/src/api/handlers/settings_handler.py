"""
Settings Message Handlers.

Handles settings-related messages (load, update).
"""
import logging
from typing import Any, Dict
from fastapi import WebSocket

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.schema import LoadSettingsMessage, UpdateSettingsMessage
from backend.src.api.deps import SessionManager
from backend.src.core.config import AppConfig
from backend.src.core.config_service import get_config_service
from backend.src.core.validation import (
    validate_message, 
    validate_settings_update, 
    ValidationError
)
from backend.src.llm.model_registry import get_all_models

logger = logging.getLogger(__name__)


class LoadSettingsHandler(MessageHandler):
    """Handler for load-settings messages."""
    
    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate load-settings message structure."""
        try:
            validate_message(data, "load-settings", LoadSettingsMessage)
            return True
        except ValidationError:
            return False
    
    async def handle(
        self, 
        data: Dict[str, Any], 
        websocket: WebSocket,
        user_id: str
    ) -> None:
        """
        Handle a load-settings message.
        
        Args:
            data: Message data dictionary
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        try:
            validated = validate_message(data, "load-settings", LoadSettingsMessage)
            config_service = get_config_service()
            config_payload = config_service.get_config().model_dump(exclude={"api_key"})
            await websocket.send_json({
                "type": "settings-loaded",
                "id": validated.id,
                "payload": config_payload
            })
        except ValidationError as e:
            await websocket.send_json({
                "type": "error",
                "id": data.get("id"),
                "payload": {"message": f"Invalid load-settings message: {e.message}"}
            })
        except Exception as e:
            logger.error(f"Error loading settings: {e}", exc_info=True)
            await websocket.send_json({
                "type": "error",
                "id": data.get("id"),
                "payload": {"message": f"Failed to load settings: {str(e)}"}
            })


class UpdateSettingsHandler(MessageHandler):
    """Handler for update-settings messages."""
    
    def __init__(self, session_manager: SessionManager):
        """
        Initialize the update settings handler.
        
        Args:
            session_manager: Session manager instance
        """
        self.session_manager = session_manager
    
    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate update-settings message structure."""
        try:
            validate_message(data, "update-settings", UpdateSettingsMessage)
            return True
        except ValidationError:
            return False
    
    async def handle(
        self, 
        data: Dict[str, Any], 
        websocket: WebSocket,
        user_id: str
    ) -> None:
        """
        Handle an update-settings message.
        
        Args:
            data: Message data dictionary
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        msg_id = data.get("id")
        try:
            validated = validate_message(data, "update-settings", UpdateSettingsMessage)
            
            # Validate settings update payload
            new_config_data = validate_settings_update(validated.payload)
            
            config_service = get_config_service()
            current_settings = config_service.get_config()
            
            # Merge and validate with AppConfig
            merged_data = {**current_settings.model_dump(), **new_config_data}
            validated_config = AppConfig(**merged_data)
            
            # Update config via ConfigurationService (handles notifications)
            await config_service.update_config(validated_config)
            
            # Update sessions
            await self.session_manager.update_all_sessions_config(validated_config)
            
            await websocket.send_json({
                "type": "settings-updated",
                "id": msg_id,
                "payload": {"message": "Settings updated successfully"}
            })
        
        except ValidationError as e:
            await websocket.send_json({
                "type": "error",
                "id": msg_id,
                "payload": {"message": f"Invalid update-settings message: {e.message}"}
            })
        except Exception as e:
            logger.error(f"Failed to update settings: {e}", exc_info=True)
            await websocket.send_json({
                "type": "error",
                "id": msg_id,
                "payload": {"message": f"Failed to update settings: {str(e)}"}
            })


class ListModelsHandler(MessageHandler):
    """Handler for list-models messages."""
    
    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate list-models message structure."""
        try:
            from backend.src.api.schema import ListModelsMessage
            validate_message(data, "list-models", ListModelsMessage)
            return True
        except ValidationError:
            return False
    
    async def handle(
        self, 
        data: Dict[str, Any], 
        websocket: WebSocket,
        user_id: str
    ) -> None:
        """
        Handle a list-models message.
        
        Args:
            data: Message data dictionary
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        try:
            from backend.src.api.schema import ListModelsMessage
            validated = validate_message(data, "list-models", ListModelsMessage)
            models = await get_all_models()
            await websocket.send_json({
                "type": "models-listed",
                "id": validated.id,
                "payload": models
            })
        except ValidationError as e:
            await websocket.send_json({
                "type": "error",
                "id": data.get("id"),
                "payload": {"message": f"Invalid list-models message: {e.message}"}
            })
        except Exception as e:
            logger.error(f"Error listing models: {e}", exc_info=True)
            await websocket.send_json({
                "type": "error",
                "id": data.get("id"),
                "payload": {"message": f"Failed to list models: {str(e)}"}
            })

