"""Receive-loop helper logic for websocket route runtime."""

from __future__ import annotations

import logging
from typing import Awaitable, Callable

from backend.src.api.schemas import IncomingMessage
from backend.src.api.transport.websocket import SafeWebSocket
from backend.src.api.infrastructure.registry import MessageHandlerRegistry
from backend.src.api.routes.websocket.task_manager import TaskManager

SendErrorFn = Callable[[SafeWebSocket, str | None, str], Awaitable[None]]
HandleMessageFn = Callable[[SafeWebSocket, IncomingMessage, MessageHandlerRegistry, str], Awaitable[None]]


async def close_connection_on_timeout(
    safe_ws: SafeWebSocket,
    user_id: str,
    websocket_receive_timeout: float,
    *,
    logger: logging.Logger,
) -> None:
    """Close timed-out connections with policy-violation semantics."""
    logger.info(
        "Connection timeout for user %s (no data received in %ss)",
        user_id,
        websocket_receive_timeout,
    )
    try:
        await safe_ws.close(code=1008, reason="Connection timeout - no data received")
    except Exception:
        # Connection may already be closed.
        pass


async def schedule_validated_message_task(
    *,
    task_manager: TaskManager,
    safe_ws: SafeWebSocket,
    validated_msg: IncomingMessage,
    handler_registry: MessageHandlerRegistry,
    user_id: str,
    max_concurrent_tasks: int,
    send_error: SendErrorFn,
    handle_message: HandleMessageFn,
    logger: logging.Logger,
) -> None:
    """Schedule validated websocket message with task-limit handling."""
    msg_id = validated_msg.id
    accepted = await task_manager.create_task_if_under_limit(
        handle_message(safe_ws, validated_msg, handler_registry, user_id),
        user_id,
    )
    if not accepted:
        logger.warning(
            "User %s exceeded max concurrent tasks (%s)",
            user_id,
            max_concurrent_tasks,
        )
        await send_error(
            safe_ws,
            msg_id,
            "Too many concurrent requests. Please wait.",
        )
        return

