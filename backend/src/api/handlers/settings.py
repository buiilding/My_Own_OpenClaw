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
from backend.src.api.schemas.incoming import (
    LoadSettingsMessage,
    ListModelsMessage,
    UpdateSettingsMessage,
)

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager
from backend.src.core.validation.validators import (
    CLIENT_SETTINGS_PATCH_FIELDS,
    ValidationError,
    validate_client_settings_patch,
)
from backend.src.llm.models.model_service import ModelService
from backend.src.tools.client_manifest import validate_client_tool_manifest

logger = logging.getLogger(__name__)


def _redact_provider_api_keys(value: Any) -> Any:
    if not isinstance(value, dict):
        return value

    redacted: Dict[str, Any] = {}
    for provider, entry in value.items():
        if not isinstance(entry, dict):
            redacted[provider] = entry
            continue
        redacted_entry = dict(entry)
        if "api_key" in redacted_entry:
            redacted_entry["api_key"] = ""
        redacted[provider] = redacted_entry
    return redacted


def _build_client_settings_payload(config: Any) -> Dict[str, Any]:
    """
    Extract client settings patch keys from an AppConfig-like object.

    Returns a stable key order for deterministic responses/tests.
    """
    if config is None:
        return {}
    payload: Dict[str, Any] = {}
    for key in sorted(CLIENT_SETTINGS_PATCH_FIELDS):
        if not hasattr(config, key):
            continue
        value = getattr(config, key)
        if hasattr(value, "model_dump"):
            dumped = value.model_dump()
            if key == "provider_api_keys":
                dumped = _redact_provider_api_keys(dumped)
            payload[key] = dumped
            continue
        if key == "provider_api_keys":
            value = _redact_provider_api_keys(value)
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

        Returns client settings from active session config if present,
        otherwise from global app config defaults.
        """
        try:
            session = self.session_manager.get_session(user_id)
            config_source = getattr(session, "cfg", None)
            if config_source is None:
                effective_config = getattr(
                    self.session_manager,
                    "get_effective_config",
                    None,
                )
                if callable(effective_config):
                    config_source = effective_config(user_id)
                else:
                    config_source = getattr(self.session_manager, "config", None)

            await send_success_response(
                websocket,
                message.id,
                OutgoingMessageType.SETTINGS_LOADED,
                {"config": _build_client_settings_payload(config_source)},
            )
        except ValidationError as e:
            await send_error_response(
                websocket,
                message.id,
                f"Invalid load-settings message: {e.message}",
                user_facing=True,
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
                websocket,
                message.id,
                f"Invalid list-models message: {e.message}",
                user_facing=True,
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

        Applies validated client settings updates to the user's session.
        """
        try:
            payload = message.payload.model_dump(exclude_none=True)
            tools_payload = payload.pop("tools", None)
            agent_definition = message.payload.agent_definition
            payload.pop("agent_definition", None)
            updates = validate_client_settings_patch(payload)

            if updates:
                await self.session_manager.update_session_config(user_id, updates)

            updated_keys = list(updates.keys())
            if tools_payload is not None:
                mode = tools_payload.get("mode")
                if mode != "replace_client_manifest":
                    raise ValidationError(f"Unsupported tools.mode: {mode}")
                manifest_result = validate_client_tool_manifest(
                    tools_payload.get("client_manifest")
                )
                set_client_tool_manifest = getattr(
                    self.session_manager,
                    "set_client_tool_manifest",
                    None,
                )
                if not callable(set_client_tool_manifest):
                    raise ValidationError(
                        "Client tool manifests are not supported by this session manager"
                    )
                set_client_tool_manifest(user_id, manifest_result)
                updated_keys.append("tools")

            if agent_definition is not None:
                set_agent_definition = getattr(
                    self.session_manager,
                    "set_agent_definition",
                    None,
                )
                if not callable(set_agent_definition):
                    raise ValidationError(
                        "Agent definitions are not supported by this session manager"
                    )
                set_agent_definition(user_id, agent_definition)
                updated_keys.append("agent_definition")

            await send_success_response(
                websocket,
                message.id,
                OutgoingMessageType.SETTINGS_UPDATED,
                {"updated_keys": updated_keys},
            )
        except ValidationError as e:
            await send_error_response(
                websocket,
                message.id,
                f"Invalid settings: {e.message}",
                user_facing=True,
            )
        except Exception as e:
            await send_error_response(websocket, message.id, None, exception=e)
