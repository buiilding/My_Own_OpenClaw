"""
Settings Message Handlers.

Handles settings-related messages (load, update).
"""
import logging
from typing import TYPE_CHECKING, Any, Dict

from backend.src.api.infrastructure.handler import MessageHandler
from backend.src.api.infrastructure.errors import send_error_response, send_success_response
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.schema import (
    BaseMessage,
    ListModelsMessage,
    UpdateSettingsMessage,
)

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager
from backend.src.core.validation.validators import (
    ValidationError,
    validate_frontend_config,
)
from backend.src.llm.models.model_service import ModelService

logger = logging.getLogger(__name__)


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


class UpdateSettingsHandler(MessageHandler):
    """Handler for update-settings messages."""

    def __init__(self, session_manager: "SessionManager"):
        """
        Initialize the update settings handler.

        Args:
            session_manager: Session manager instance for accessing sessions
        """
        self.session_manager = session_manager

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

        Applies frontend-owned config updates to the user's session.
        """
        try:
            validated: UpdateSettingsMessage = message  # type: ignore
            updates = validate_frontend_config(validated.payload)

            if updates:
                await self.session_manager.update_session_config(user_id, updates)

            await send_success_response(
                websocket,
                validated.id,
                "settings-updated",
                {"updated_keys": list(updates.keys())}
            )
        except ValidationError as e:
            await send_error_response(
                websocket,
                message.id,
                f"Invalid settings: {e.message}"
            )
        except Exception as e:
            await send_error_response(
                websocket,
                message.id,
                None,
                exception=e
            )
