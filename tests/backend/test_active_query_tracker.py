"""Covers active query tracker behavior in the backend test suite."""

import asyncio

import pytest

from backend.src.agent.session.active_query_tracker import ActiveQueryTracker


@pytest.mark.asyncio
async def test_active_query_tracker_scopes_cancel_to_matching_conversation():
    tracker = ActiveQueryTracker()

    async def _sleep():
        await asyncio.sleep(3600)

    task_a = asyncio.create_task(_sleep())
    task_b = asyncio.create_task(_sleep())
    try:
        tracker.register_active_query_task(
            "user-1", task_a, turn_ref="turn-a", conversation_ref="conv-a"
        )
        tracker.register_active_query_task(
            "user-1", task_b, turn_ref="turn-b", conversation_ref="conv-b"
        )

        cancelled = tracker.cancel_active_query_task(
            "user-1", conversation_ref="conv-a"
        )
        await asyncio.sleep(0)

        assert cancelled == ("turn-a", "conv-a")
        assert task_a.cancelled() is True
        assert task_b.cancelled() is False
    finally:
        tracker.clear_active_query_task("user-1", task_b)
        task_b.cancel()
        await asyncio.gather(task_a, task_b, return_exceptions=True)


@pytest.mark.asyncio
async def test_active_query_tracker_scopes_cancel_to_matching_turn_ref():
    tracker = ActiveQueryTracker()

    async def _sleep():
        await asyncio.sleep(3600)

    task_a = asyncio.create_task(_sleep())
    task_b = asyncio.create_task(_sleep())
    try:
        tracker.register_active_query_task(
            "user-1", task_a, turn_ref="turn-a", conversation_ref="conv-a"
        )
        tracker.register_active_query_task(
            "user-1", task_b, turn_ref="turn-b", conversation_ref="conv-a"
        )

        cancelled = tracker.cancel_active_query_task(
            "user-1",
            conversation_ref="conv-a",
            turn_ref="turn-a",
        )
        await asyncio.sleep(0)

        assert cancelled == ("turn-a", "conv-a")
        assert task_a.cancelled() is True
        assert task_b.cancelled() is False
    finally:
        tracker.clear_active_query_task("user-1", task_b)
        task_b.cancel()
        await asyncio.gather(task_a, task_b, return_exceptions=True)
