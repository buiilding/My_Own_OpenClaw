"""
Settings Message Handlers.

Handles settings-related messages (load, update).
"""
import logging
from typing import TYPE_CHECKING, Any, Dict

from backend.src.api.core.base import MessageHandler
from backend.src.api.core.errors import send_error_response, send_success_response
from backend.src.api.core.transport import WebSocketSender
from backend.src.api.schema import (
    BaseMessage,
    ListModelsMessage,
)

if TYPE_CHECKING:
    from backend.src.agent.core.session_manager import SessionManager
from backend.src.core.config.service import ConfigurationService
from backend.src.core.validation import (
    validate_settings_update, 
    ValidationError
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
