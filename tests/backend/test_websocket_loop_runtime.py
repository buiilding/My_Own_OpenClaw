"""Covers websocket loop runtime behavior in the backend test suite."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

import pytest

from backend.src.api.routes.websocket.loop_runtime import (
    close_connection_on_timeout,
    schedule_validated_message_task,
)


class DummySafeWebSocket:
    def __init__(self) -> None:
        self.closed: list[tuple[int, str | None]] = []

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed.append((code, reason))


class ExplodingSafeWebSocket(DummySafeWebSocket):
    async def close(
        self, code: int = 1000, reason: str | None = None
    ) -> None:  # noqa: ARG002
        raise RuntimeError("close failed")


@dataclass
class DummyValidatedMessage:
    id: str
    type: str = "query"
    payload: Any | None = None
    conversation_ref: str | None = None
    turn_ref: str | None = None


class DummyTaskManager:
    def __init__(self, *, limit_exceeded: bool) -> None:
        self.limit_exceeded = limit_exceeded
        self.calls: list[tuple[Any, str, Any]] = []

    async def create_task_if_under_limit(self, coro, user_id: str, metadata=None):
        self.calls.append((coro, user_id, metadata))
        if self.limit_exceeded:
            close = getattr(coro, "close", None)
            if callable(close):
                close()
            return False
        asyncio.create_task(coro)
        return True

    async def active_task_diagnostics(self):
        return {
            "active_count": 2,
            "max_concurrent_tasks": 2,
            "by_type": {"query": 2},
            "oldest": [],
        }


@pytest.mark.asyncio
async def test_close_connection_on_timeout_uses_policy_violation_close_code() -> None:
    safe_ws = DummySafeWebSocket()
    await close_connection_on_timeout(
        safe_ws,
        "user-1",
        3.0,
        logger=logging.getLogger("test.websocket.loop_runtime"),
    )
    assert safe_ws.closed == [(1008, "Connection timeout - no data received")]


@pytest.mark.asyncio
async def test_close_connection_on_timeout_swallows_close_failures() -> None:
    await close_connection_on_timeout(
        ExplodingSafeWebSocket(),
        "user-1",
        3.0,
        logger=logging.getLogger("test.websocket.loop_runtime"),
    )


@pytest.mark.asyncio
async def test_schedule_validated_message_task_sends_limit_error_when_limit_exceeded() -> (
    None
):
    send_error_calls: list[tuple[str | None, str]] = []
    logger = logging.getLogger("test.websocket.loop_runtime.limit")

    async def send_error(ws, msg_id, message):  # noqa: ARG001
        send_error_calls.append((msg_id, message))

    async def handle_message(ws, message, registry, user_id):  # noqa: ARG001
        raise AssertionError(
            "handle_message should not run when task limit is exceeded"
        )

    await schedule_validated_message_task(
        task_manager=DummyTaskManager(limit_exceeded=True),
        safe_ws=DummySafeWebSocket(),
        validated_msg=DummyValidatedMessage(id="msg-1"),
        handler_registry=object(),
        user_id="user-1",
        max_concurrent_tasks=2,
        send_error=send_error,
        handle_message=handle_message,
        logger=logger,
    )

    assert send_error_calls == [("msg-1", "Too many concurrent requests. Please wait.")]


@pytest.mark.asyncio
async def test_schedule_validated_message_task_dispatches_message_when_under_limit() -> (
    None
):
    handled_messages: list[str] = []
    task_manager = DummyTaskManager(limit_exceeded=False)

    async def send_error(ws, msg_id, message):  # noqa: ARG001
        raise AssertionError("send_error should not run when task is accepted")

    async def handle_message(ws, message, registry, user_id):  # noqa: ARG001
        handled_messages.append(f"{user_id}:{message.id}")

    await schedule_validated_message_task(
        task_manager=task_manager,
        safe_ws=DummySafeWebSocket(),
        validated_msg=DummyValidatedMessage(
            id="msg-2",
            payload=type("Payload", (), {"conversation_ref": "conv-1"})(),
        ),
        handler_registry=object(),
        user_id="user-2",
        max_concurrent_tasks=2,
        send_error=send_error,
        handle_message=handle_message,
        logger=logging.getLogger("test.websocket.loop_runtime"),
    )

    await asyncio.sleep(0)
    assert handled_messages == ["user-2:msg-2"]
    assert task_manager.calls[0][2].message_type == "query"
    assert task_manager.calls[0][2].message_id == "msg-2"
    assert task_manager.calls[0][2].conversation_ref == "conv-1"
    assert task_manager.calls[0][2].turn_ref == "msg-2"
