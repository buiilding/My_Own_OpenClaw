"""
Settings Message Handlers.

Handles settings-related messages (load, update).
"""

import logging
from typing import TYPE_CHECKING, Any, Dict

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.infrastructure.handler import TypedMessageHandler
from backend.src.api.infrastructure.errors import (
    send_error_response,
    send_success_response,
)
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.schema import (
    LoadSettingsMessage,
    ListModelsMessage,
    UpdateSettingsMessage,
)

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager
from backend.src.core.validation.validators import (
    FRONTEND_CONFIG_FIELDS,
    ValidationError,
    validate_frontend_config,
)
from backend.src.llm.models.model_service import ModelService

logger = logging.getLogger(__name__)


def _build_frontend_settings_payload(config: Any) -> Dict[str, Any]:
    """
    Extract frontend-owned config keys from an AppConfig-like object.

    Returns a stable key order for deterministic responses/tests.
    """
    if config is None:
        return {}
    payload: Dict[str, Any] = {}
    for key in sorted(FRONTEND_CONFIG_FIELDS):
        if not hasattr(config, key):
            continue
        value = getattr(config, key)
        if hasattr(value, "model_dump"):
            payload[key] = value.model_dump()
            continue
        payload[key] = value
    return payload


class LoadSettingsHandler(TypedMessageHandler[LoadSettingsMessage]):
    """Handler for load-settings messages."""

    def __init__(self, session_manager: "SessionManager"):
        """
        Initialize the load settings handler.

        Args:
            session_manager: Session manager instance for session/global config access
        """
        self.session_manager = session_manager

    message_model = LoadSettingsMessage

    async def handle_typed(
        self, message: LoadSettingsMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle a load-settings message.

        Returns frontend-owned settings from active session config if present,
        otherwise from global app config defaults.
        """
        try:
            session = self.session_manager.get_session(user_id)
            config_source = getattr(session, "cfg", None)
            if config_source is None:
                config_source = getattr(self.session_manager, "config", None)

            await send_success_response(
                websocket,
                message.id,
                OutgoingMessageType.SETTINGS_LOADED,
                {"config": _build_frontend_settings_payload(config_source)},
            )
        except ValidationError as e:
            await send_error_response(
                websocket, message.id, f"Invalid load-settings message: {e.message}"
            )
        except Exception as e:
            await send_error_response(websocket, message.id, None, exception=e)


class ListModelsHandler(TypedMessageHandler[ListModelsMessage]):
    """Handler for list-models messages."""

    def __init__(self, model_service: ModelService):
        """
        Initialize the list models handler.

        Args:
            model_service: Model service instance
        """
        self.model_service = model_service

    message_model = ListModelsMessage

    async def handle_typed(
        self, message: ListModelsMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle a list-models message.

        Args:
            message: Validated ListModelsMessage Pydantic model
            websocket: WebSocketSender (thread-safe protocol implementation)
            user_id: User ID from connection context
        """
        try:
            models = await self.model_service.get_all_models()

            # Send success response using canonical utility
            await send_success_response(
                websocket, message.id, OutgoingMessageType.MODELS_LISTED, models
            )
        except ValidationError as e:
            # Validation error - send using canonical utility
            await send_error_response(
                websocket, message.id, f"Invalid list-models message: {e.message}"
            )
        except Exception as e:
            # Unexpected error - send sanitized error to prevent information leakage
            await send_error_response(websocket, message.id, None, exception=e)


class UpdateSettingsHandler(TypedMessageHandler[UpdateSettingsMessage]):
    """Handler for update-settings messages."""

    def __init__(self, session_manager: "SessionManager"):
        """
        Initialize the update settings handler.

        Args:
            session_manager: Session manager instance for accessing sessions
        """
        self.session_manager = session_manager

    message_model = UpdateSettingsMessage

    async def handle_typed(
        self, message: UpdateSettingsMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle an update-settings message.

        Applies frontend-owned config updates to the user's session.
        """
        try:
            updates = validate_frontend_config(
                message.payload.model_dump(exclude_none=True)
            )

            if updates:
                await self.session_manager.update_session_config(user_id, updates)

            await send_success_response(
                websocket,
                message.id,
                OutgoingMessageType.SETTINGS_UPDATED,
                {"updated_keys": list(updates.keys())},
            )
        except ValidationError as e:
            await send_error_response(
                websocket, message.id, f"Invalid settings: {e.message}"
            )
        except Exception as e:
            await send_error_response(websocket, message.id, None, exception=e)
