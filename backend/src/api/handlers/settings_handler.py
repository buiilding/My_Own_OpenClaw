"""
Settings Message Handlers.

Handles settings-related messages (load, update).
"""
import logging
from typing import TYPE_CHECKING, Any, Dict
from fastapi import WebSocket

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.schema import LoadSettingsMessage, UpdateSettingsMessage
from backend.src.core.config import AppConfig

if TYPE_CHECKING:
    from backend.src.agent.core.session_manager import SessionManager
from backend.src.core.config_service import ConfigurationService
from backend.src.core.config.user_config_manager import UserConfigManager
from backend.src.core.config.manager import load_api_key_for_provider
from backend.src.core.validation import (
    validate_message, 
    validate_settings_update, 
    ValidationError
)
from backend.src.llm.model_service import ModelService

logger = logging.getLogger(__name__)


class LoadSettingsHandler(MessageHandler):
    """Handler for load-settings messages."""
    
    def __init__(
        self,
        config_service: ConfigurationService,
        user_config_manager: UserConfigManager,
    ):
        """
        Initialize the load settings handler.

        Args:
            config_service: Configuration service instance
            user_config_manager: User configuration manager instance
        """
        self.config_service = config_service
        self.user_config_manager = user_config_manager
    
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
            
            # Get global config
            global_config = self.config_service.get_config()
            global_config_dict = global_config.model_dump(exclude={"api_key"})
            
            # Merge with user-specific config (user config overrides global)
            merged_config_dict = self.user_config_manager.merge_with_global_config(
                user_id, global_config_dict
            )
            
            await websocket.send_json({
                "type": "settings-loaded",
                "id": validated.id,
                "payload": merged_config_dict
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
    
    def __init__(
        self,
        session_manager: "SessionManager",
        config_service: ConfigurationService,
        user_config_manager: UserConfigManager,
    ):
        """
        Initialize the update settings handler.
        
        Args:
            session_manager: Session manager instance
            config_service: Configuration service instance
            user_config_manager: User configuration manager instance
        """
        self.session_manager = session_manager
        self.config_service = config_service
        self.user_config_manager = user_config_manager
    
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
            
            global_config = self.config_service.get_config()
            
            # Get user-specific config to merge with updates
            user_config = self.user_config_manager.load_user_config(user_id)
            
            # Merge: user config + new updates (updates override existing user config)
            # Only frontend-managed fields should be in user_config and new_config_data
            merged_user_config = {**user_config, **new_config_data}
            
            # Save user-specific config (only frontend-managed fields - filters automatically)
            self.user_config_manager.save_user_config(user_id, merged_user_config)
            
            # Build complete config for this user: global + user-specific overrides
            complete_config_dict = {**global_config.model_dump(), **merged_user_config}
            
            # tts_enabled is always True (hardcoded, not configurable)
            # speech_mode_enabled controls whether TTS is actually used
            complete_config_dict["tts_enabled"] = True
            
            # Set default TTS model path if TTS is enabled and path is not set
            tts_will_be_enabled = complete_config_dict.get("tts_enabled", global_config.tts_enabled)
            if tts_will_be_enabled:
                if not complete_config_dict.get("tts_model_path") and not global_config.tts_model_path:
                    complete_config_dict["tts_model_path"] = "/home/peter/.config/DesktopAssistant/tts_models/piper/en_GB-jenny_dioco-medium.onnx"
            
            validated_config = AppConfig(**complete_config_dict)
            
            # Load API key for the selected provider
            validated_config = load_api_key_for_provider(validated_config)
            
            # Update only this user's session, not all sessions
            await self.session_manager.update_user_session_config(user_id, validated_config)
            
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
    
    def __init__(self, model_service: ModelService):
        """
        Initialize the list models handler.

        Args:
            model_service: Model service instance
        """
        self.model_service = model_service
    
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
            models = await self.model_service.get_all_models()
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

