"""WebSocket route entrypoint and receive-loop orchestration."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.src.api.deps import HandlerRegistryDep, SessionManagerDep
from backend.src.api.routes.websocket.connection import cleanup_connection, perform_handshake
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

router = APIRouter()
logger = logging.getLogger(__name__)


async def _close_connection_on_timeout(
    safe_ws: SafeWebSocket,
    user_id: str,
    websocket_receive_timeout: float,
) -> None:
    """Compatibility wrapper retained for package-level monkeypatch tests."""
    await close_connection_on_timeout(
        safe_ws=safe_ws,
        user_id=user_id,
        websocket_receive_timeout=websocket_receive_timeout,
        logger=logger,
    )


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

    user_id = await perform_handshake(websocket, safe_ws)
    if not user_id:
        return

    try:
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
