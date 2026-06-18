"""WebSocket route entrypoint and receive-loop orchestration."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.src.api.deps import HandlerRegistryDep, SessionManagerDep
from backend.src.api.routes.websocket.connection import (
    cleanup_connection,
    perform_handshake,
)
from backend.src.api.routes.websocket.loop_runtime import (
    close_connection_on_timeout,
    schedule_validated_message_task,
)
from backend.src.api.routes.websocket.message_handler import (
    handle_message,
    parse_and_validate_message,
    send_error,
)
from backend.src.api.routes.websocket.task_manager import TaskManager
from backend.src.api.transport.websocket import SafeWebSocket
from backend.src.tools.remote_tool_catalog import build_remote_tool_catalog

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_manager: SessionManagerDep,
    handler_registry: HandlerRegistryDep,
):
    """WebSocket endpoint for real-time communication."""
    safe_ws = SafeWebSocket(websocket)
    await safe_ws.accept()

    config = session_manager.config
    max_message_size = config.websocket_max_message_size
    max_concurrent_tasks = config.websocket_max_concurrent_tasks
    websocket_receive_timeout = config.websocket_receive_timeout
    task_cancellation_timeout = config.websocket_task_cancellation_timeout

    task_manager = TaskManager(max_concurrent_tasks, task_cancellation_timeout)
    close_requested = False
    app_state = getattr(getattr(websocket, "app", None), "state", None)
    install_auth_service = getattr(app_state, "install_auth_service", None)

    user_id = await perform_handshake(
        websocket,
        safe_ws,
        install_auth_service=install_auth_service,
        require_install_auth=bool(getattr(config, "install_auth_enabled", True)),
    )
    if not user_id:
        return

    try:
        increment_connection_count = getattr(
            session_manager, "increment_connection_count", None
        )
        if callable(increment_connection_count):
            increment_connection_count(user_id)

        client_operating_system = getattr(safe_ws, "client_operating_system", None)
        set_client_operating_system = getattr(
            session_manager,
            "set_client_operating_system",
            None,
        )
        if callable(set_client_operating_system) and isinstance(
            client_operating_system, str
        ):
            set_client_operating_system(user_id, client_operating_system)

        agent_capability_overrides = getattr(
            safe_ws,
            "agent_capability_overrides",
            None,
        )
        update_session_config = getattr(session_manager, "update_session_config", None)
        if (
            callable(update_session_config)
            and isinstance(agent_capability_overrides, dict)
            and agent_capability_overrides
        ):
            await update_session_config(user_id, agent_capability_overrides)

        client_tool_manifest_result = getattr(
            safe_ws,
            "client_tool_manifest_result",
            None,
        )
        set_client_tool_manifest = getattr(
            session_manager,
            "set_client_tool_manifest",
            None,
        )
        if callable(set_client_tool_manifest):
            set_client_tool_manifest(user_id, client_tool_manifest_result)
        client_agent_definition = getattr(safe_ws, "client_agent_definition", None)
        set_agent_definition = getattr(session_manager, "set_agent_definition", None)
        if callable(set_agent_definition) and client_agent_definition is not None:
            set_agent_definition(user_id, client_agent_definition)
        if client_tool_manifest_result is not None:
            await safe_ws.send_json(
                {
                    "type": "client-tool-manifest",
                    "payload": client_tool_manifest_result.to_public_dict(),
                }
            )
        get_effective_config = getattr(session_manager, "get_effective_config", None)
        remote_catalog_config = (
            get_effective_config(user_id) if callable(get_effective_config) else config
        )
        await safe_ws.send_json(
            {
                "type": "remote-tool-catalog",
                "payload": build_remote_tool_catalog(remote_catalog_config),
            }
        )

        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=websocket_receive_timeout,
                )
            except asyncio.TimeoutError:
                await close_connection_on_timeout(
                    safe_ws=safe_ws,
                    user_id=user_id,
                    websocket_receive_timeout=websocket_receive_timeout,
                    logger=logger,
                )
                close_requested = True
                break

            validated_msg, error_msg = await parse_and_validate_message(
                data,
                user_id,
                max_message_size,
            )
            if error_msg:
                await send_error(safe_ws, None, error_msg)
                continue
            if not validated_msg:
                continue

            await schedule_validated_message_task(
                task_manager=task_manager,
                safe_ws=safe_ws,
                validated_msg=validated_msg,
                handler_registry=handler_registry,
                user_id=user_id,
                max_concurrent_tasks=max_concurrent_tasks,
                send_error=send_error,
                handle_message=handle_message,
                logger=logger,
            )

    except WebSocketDisconnect:
        logger.info("Client %s disconnected", user_id)
    except Exception as error:
        logger.error(
            "Unexpected error in WebSocket loop for user %s: %s",
            user_id,
            error,
            exc_info=True,
        )
        raise
    finally:
        if not close_requested:
            try:
                await safe_ws.close()
            except Exception as close_error:
                logger.debug(
                    "WebSocket close during connection cleanup failed for user %s: %s",
                    user_id,
                    close_error,
                )
        await cleanup_connection(task_manager, session_manager, user_id)
