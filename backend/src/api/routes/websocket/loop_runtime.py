"""Receive-loop helper logic for websocket route runtime."""

from __future__ import annotations

import logging
from typing import Awaitable, Callable

from backend.src.api.schemas.incoming import IncomingMessage
from backend.src.api.transport.websocket import SafeWebSocket
from backend.src.api.infrastructure.registry import MessageHandlerRegistry
from backend.src.api.routes.websocket.task_manager import TaskManager, TaskMetadata

SendErrorFn = Callable[[SafeWebSocket, str | None, str], Awaitable[None]]
HandleMessageFn = Callable[
    [SafeWebSocket, IncomingMessage, MessageHandlerRegistry, str], Awaitable[None]
]


def _payload_value(message: IncomingMessage, field_name: str) -> str | None:
    payload = getattr(message, "payload", None)
    value = getattr(payload, field_name, None)
    return value if isinstance(value, str) and value else None


def _message_context_value(message: IncomingMessage, field_name: str) -> str | None:
    value = getattr(message, field_name, None)
    if isinstance(value, str) and value:
        return value
    return _payload_value(message, field_name)


def task_metadata_for_message(message: IncomingMessage) -> TaskMetadata:
    """Extract logging metadata from a validated websocket message."""
    message_type = getattr(message, "type", None) or "unknown"
    message_id = getattr(message, "id", None)
    if not isinstance(message_id, str) or not message_id:
        message_id = None

    conversation_ref = _message_context_value(message, "conversation_ref")
    turn_ref = _message_context_value(message, "turn_ref")
    if not turn_ref and message_type == "query":
        turn_ref = message_id

    correlation_ref = (
        _payload_value(message, "request_id")
        or _payload_value(message, "bundle_id")
        or _message_context_value(message, "event_id")
    )

    return TaskMetadata(
        message_type=message_type,
        message_id=message_id,
        conversation_ref=conversation_ref,
        turn_ref=turn_ref,
        correlation_ref=correlation_ref,
    )


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
    metadata = task_metadata_for_message(validated_msg)
    accepted = await task_manager.create_task_if_under_limit(
        handle_message(safe_ws, validated_msg, handler_registry, user_id),
        user_id,
        metadata=metadata,
    )
    if not accepted:
        diagnostics = await task_manager.active_task_diagnostics()
        logger.warning(
            "User %s exceeded max concurrent tasks (%s); rejected_message=%s active_tasks=%s",
            user_id,
            max_concurrent_tasks,
            metadata,
            diagnostics,
        )
        await send_error(
            safe_ws,
            msg_id,
            "Too many concurrent requests. Please wait.",
        )
        return
