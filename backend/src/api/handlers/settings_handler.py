"""
Settings Message Handlers.

Handles settings-related messages (load, update).
"""
import logging
from typing import TYPE_CHECKING, Any, Dict
from fastapi import WebSocket

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.handlers.error_utils import send_error_response, send_success_response
from backend.src.api.handlers.transport import WebSocketSender
from backend.src.api.schema import (
    BaseMessage,
    LoadSettingsMessage,
    ListModelsMessage,
    UpdateSettingsMessage,
)

if TYPE_CHECKING:
    from backend.src.agent.core.session_manager import SessionManager
from backend.src.core.config_service import ConfigurationService
from backend.src.core.config.user_config_manager import UserConfigManager
from backend.src.core.validation import (
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
    
    def validate_message(self, message: BaseMessage) -> bool:
        """Validate load-settings message structure."""
        return isinstance(message, LoadSettingsMessage)
    
    async def handle(
        self, 
        message: BaseMessage, 
        websocket: WebSocketSender,
        user_id: str
    ) -> None:
        """
        Handle a load-settings message.
        
        Args:
            message: Validated LoadSettingsMessage Pydantic model
            websocket: WebSocketSender (thread-safe protocol implementation)
            user_id: User ID from connection context
        """
        try:
            # Type assertion - message is already validated as LoadSettingsMessage
            validated: LoadSettingsMessage = message  # type: ignore
            
            # Get global config
            global_config = self.config_service.get_config()
            global_config_dict = global_config.model_dump(exclude={"api_key"})
            
            # Merge with user-specific config (user config overrides global)
            merged_config_dict = self.user_config_manager.merge_with_global_config(
                user_id, global_config_dict
            )
            
            # Send success response using canonical utility
            await send_success_response(
                websocket,
                validated.id,
                "settings-loaded",
                merged_config_dict
            )
        except ValidationError as e:
            # Validation error - send using canonical utility
            await send_error_response(
                websocket,
                message.id,
                f"Invalid load-settings message: {e.message}"
            )
        except Exception as e:
            # Unexpected error - send sanitized error to prevent information leakage
            await send_error_response(
                websocket,
                message.id,
                None,
                exception=e
            )


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
    
    def validate_message(self, message: BaseMessage) -> bool:
        """Validate update-settings message structure."""
        return isinstance(message, UpdateSettingsMessage)
    
    async def handle(
        self, 
        message: BaseMessage, 
        websocket: WebSocketSender,
        user_id: str
    ) -> None:
        """
        Handle an update-settings message.
        
        Args:
            message: Validated UpdateSettingsMessage Pydantic model
            websocket: WebSocketSender (thread-safe protocol implementation)
            user_id: User ID from connection context
        """
        try:
            # Type assertion - message is already validated as UpdateSettingsMessage
            validated: UpdateSettingsMessage = message  # type: ignore
            
            # Validate settings update payload
            new_config_data = validate_settings_update(validated.payload)
            
            # Get user-specific config to merge with updates
            user_config = self.user_config_manager.load_user_config(user_id)
            
            # Merge: user config + new updates (updates override existing user config)
            # Only frontend-managed fields should be in user_config and new_config_data
            merged_user_config = {**user_config, **new_config_data}
            
            # Save user-specific config (only frontend-managed fields - filters automatically)
            self.user_config_manager.save_user_config(user_id, merged_user_config)
            
            # Build complete config with policies applied (delegates to service)
            validated_config = self.config_service.build_user_config(merged_user_config)
            
            # Update only this user's session, not all sessions
            await self.session_manager.update_user_session_config(user_id, validated_config)
            
            # Send success response using canonical utility
            await send_success_response(
                websocket,
                validated.id,
                "settings-updated",
                {"message": "Settings updated successfully"}
            )
        
        except ValidationError as e:
            # Validation error - send using canonical utility
            await send_error_response(
                websocket,
                message.id,
                f"Invalid update-settings message: {e.message}"
            )
        except Exception as e:
            # Unexpected error - send sanitized error to prevent information leakage
            await send_error_response(
                websocket,
                message.id,
                None,
                exception=e
            )


class ListModelsHandler(MessageHandler):
    """Handler for list-models messages."""
    
    def __init__(self, model_service: ModelService):
        """
        Initialize the list models handler.

        Args:
            model_service: Model service instance
        """
        self.model_service = model_service
    
    def validate_message(self, message: BaseMessage) -> bool:
        """Validate list-models message structure."""
        return isinstance(message, ListModelsMessage)
    
    async def handle(
        self, 
        message: BaseMessage, 
        websocket: WebSocketSender,
        user_id: str
    ) -> None:
        """
        Handle a list-models message.
        
        Args:
            message: Validated ListModelsMessage Pydantic model
            websocket: WebSocketSender (thread-safe protocol implementation)
            user_id: User ID from connection context
        """
        try:
            # Type assertion - message is already validated as ListModelsMessage
            validated: ListModelsMessage = message  # type: ignore
            models = await self.model_service.get_all_models()
            
            # Send success response using canonical utility
            await send_success_response(
                websocket,
                validated.id,
                "models-listed",
                models
            )
        except ValidationError as e:
            # Validation error - send using canonical utility
            await send_error_response(
                websocket,
                message.id,
                f"Invalid list-models message: {e.message}"
            )
        except Exception as e:
            # Unexpected error - send sanitized error to prevent information leakage
            await send_error_response(
                websocket,
                message.id,
                None,
                exception=e
            )

