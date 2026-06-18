"""
Connection Lifecycle Management for WebSocket Routes.

Handles handshake, connection setup, and cleanup.
"""

import asyncio
import json
import logging

from fastapi import WebSocket
from pydantic import ValidationError as PydanticValidationError

from backend.src.api.auth.service import InstallAuthService, extract_bearer_token
from backend.src.api.routes.websocket.json_parse import (
    DEFAULT_JSON_PARSE_OFFLOAD_BYTES,
    JsonRootTypeError,
    parse_json_object_payload,
)
from backend.src.api.routes.websocket.task_manager import TaskManager
from backend.src.api.schemas.common import HandshakeMessage
from backend.src.api.transport.websocket import SafeWebSocket
from backend.src.tools.client_manifest import validate_client_tool_manifest

logger = logging.getLogger(__name__)
_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES = DEFAULT_JSON_PARSE_OFFLOAD_BYTES


async def _close_policy_violation(safe_ws: SafeWebSocket, reason: str) -> None:
    """Close websocket with policy-violation code and swallow close failures."""
    try:
        await safe_ws.close(code=1008)  # Policy Violation
    except Exception as close_error:
        logger.debug(f"Error closing WebSocket after {reason}: {close_error}")


async def _fail_handshake(
    *,
    safe_ws: SafeWebSocket,
    error: Exception,
    close_reason: str,
    validation_error: bool,
) -> None:
    """
    Log handshake failure and close the websocket with policy-violation semantics.

    Validation/JSON issues are expected client errors and log at warning level.
    Unexpected runtime failures log at error level.
    """
    if validation_error:
        logger.warning("Handshake validation failed (%s): %s", close_reason, error)
    else:
        logger.error("Handshake error (%s): %s", close_reason, error)
    await _close_policy_violation(safe_ws, close_reason)


async def perform_handshake(
    websocket: WebSocket,
    safe_ws: SafeWebSocket,
    *,
    install_auth_service: InstallAuthService | None = None,
    require_install_auth: bool = False,
) -> str | None:
    """
    Perform WebSocket handshake and validate client-provided user_id.

    Args:
        websocket: Raw WebSocket connection
        safe_ws: Safe WebSocket wrapper

    Returns:
        validated client user_id if handshake successful, None otherwise
    """
    try:
        raw_data = await websocket.receive_text()
        handshake_data = await parse_json_object_payload(
            raw_data,
            offload_threshold_bytes=_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES,
            loop_getter=asyncio.get_running_loop,
        )
        handshake_msg = HandshakeMessage.model_validate(handshake_data)
        claimed_user_id = handshake_msg.user_id
        agent_definition = handshake_msg.agent_definition
        client_operating_system = (
            agent_definition.runtime.operating_system
            if agent_definition is not None
            else None
        )
        setattr(safe_ws, "client_operating_system", client_operating_system)
        raw_client_tool_manifest = (
            agent_definition.client_tool_manifest()
            if agent_definition is not None
            else None
        )
        capability_overrides = (
            agent_definition.to_session_config_overrides()
            if agent_definition is not None
            else {}
        )
        client_tool_manifest_result = validate_client_tool_manifest(
            raw_client_tool_manifest
        )
        if client_tool_manifest_result.accepted:
            if agent_definition is not None:
                capability_overrides.update(
                    agent_definition.to_session_config_overrides(
                        accepted_client_tool_names=(
                            client_tool_manifest_result.accepted_tool_names
                        )
                    )
                )
        setattr(
            safe_ws,
            "agent_capability_overrides",
            capability_overrides,
        )
        setattr(
            safe_ws,
            "client_tool_manifest_result",
            client_tool_manifest_result,
        )
        setattr(safe_ws, "client_agent_definition", agent_definition)
        if client_tool_manifest_result.rejected:
            logger.warning(
                "Client tool manifest rejected %s entr%s for user %s",
                len(client_tool_manifest_result.rejected),
                "y" if len(client_tool_manifest_result.rejected) == 1 else "ies",
                claimed_user_id,
            )
        user_id = claimed_user_id
        install_id = None
        if require_install_auth:
            if install_auth_service is None:
                raise RuntimeError("install auth service unavailable")
            auth_header = getattr(
                getattr(websocket, "headers", None),
                "get",
                lambda *_args, **_kwargs: None,
            )("authorization")
            bearer_token = extract_bearer_token(auth_header)
            if bearer_token is None:
                raise ValueError("missing install bearer token")
            identity = install_auth_service.authenticate_token(bearer_token)
            if identity is None:
                raise ValueError("invalid install bearer token")
            user_id = identity.user_id
            install_id = identity.install_id
            if claimed_user_id != user_id:
                logger.warning(
                    "Handshake user_id mismatch ignored (claimed=%s authenticated=%s)",
                    claimed_user_id,
                    user_id,
                )
        setattr(safe_ws, "authenticated_user_id", user_id)
        setattr(safe_ws, "authenticated_install_id", install_id)
        logger.info(
            "Handshake successful (user_id=%s, install_id=%s)",
            user_id,
            install_id or "-",
        )
        return user_id
    except (PydanticValidationError, JsonRootTypeError) as e:
        await _fail_handshake(
            safe_ws=safe_ws,
            error=e,
            close_reason="handshake validation failure",
            validation_error=True,
        )
        return None
    except json.JSONDecodeError as e:
        await _fail_handshake(
            safe_ws=safe_ws,
            error=e,
            close_reason="handshake JSON error",
            validation_error=True,
        )
        return None
    except Exception as e:
        await _fail_handshake(
            safe_ws=safe_ws,
            error=e,
            close_reason="handshake error",
            validation_error=False,
        )
        return None


async def cleanup_connection(
    task_manager: TaskManager,
    session_manager,
    user_id: str,
) -> None:
    """
    Clean up connection resources: cancel tasks and end session.

    This is called on both normal disconnect and unexpected errors to ensure
    resources are always cleaned up, preventing leaks.

    Args:
        task_manager: Task manager instance
        session_manager: Session manager instance
        user_id: User ID for the connection
    """
    # Clean up tasks
    try:
        await task_manager.cleanup(user_id)
    except Exception as e:
        logger.error(f"Error cleaning up tasks for user {user_id}: {e}", exc_info=True)

    # Clean up session only after the final active connection for this user closes.
    try:
        remaining_connections = 0
        decrement_connection_count = getattr(
            session_manager,
            "decrement_connection_count",
            None,
        )
        if callable(decrement_connection_count):
            remaining_connections = decrement_connection_count(user_id)
        if remaining_connections <= 0:
            await session_manager.end_session(user_id)
    except Exception as e:
        logger.error(f"Error ending session for user {user_id}: {e}", exc_info=True)
