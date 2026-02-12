import asyncio
from unittest.mock import MagicMock

import pytest

from backend.src.agent.session.runtime_state import SessionRuntimeState
from backend.src.agent.session.session import AgentSession
from backend.src.core.events.bus_events import InteractionCompleted
from backend.src.core.interfaces.tool import ToolResult


@pytest.mark.asyncio
async def test_agent_session_cleanup_clears_active_state_stores() -> None:
    session = AgentSession.__new__(AgentSession)
    session.session_id = "session-1"
    session.user_id = "user-1"
    session.event_bus = MagicMock()
    session.history = MagicMock()
    session.runtime = SessionRuntimeState()
    session.ocr_completion_event = session.runtime.ocr_completion_event

    session.runtime.screenshot.set_current_screenshot("shot-1", "base64-image")
    session.runtime.screenshot.set_current_ocr_results([{"text": "ok"}])

    session.runtime.resolved_calls.register("req-1", {"tool": "mouse_control"})

    session.runtime.tool_results.store_pending_result("req-1", ToolResult(success=True))
    session.runtime.tool_results.store_bundled_result("bundle-1", ToolResult(success=True))

    await AgentSession.cleanup(session)

    session.event_bus.unsubscribe.assert_called_once_with(
        InteractionCompleted,
        session._on_interaction_completed,
    )
    session.history.clear.assert_called_once()

    assert session.get_screenshot() is None
    assert session.get_ocr_results() is None
    assert session.get_current_screenshot_id() is None

    assert session.runtime.resolved_calls.get("req-1") is None
    assert session.runtime.tool_results.get_stats() == {
        "pending_results": 0,
        "result_futures": 0,
        "bundled_results": 0,
        "bundle_futures": 0,
    }


@pytest.mark.asyncio
async def test_agent_session_cleanup_cancels_tracked_background_tasks() -> None:
    session = AgentSession.__new__(AgentSession)
    session.session_id = "session-2"
    session.user_id = "user-2"
    session.event_bus = MagicMock()
    session.history = MagicMock()
    session.runtime = SessionRuntimeState()
    session.ocr_completion_event = session.runtime.ocr_completion_event

    blocker = asyncio.Event()

    async def _background_job() -> None:
        await blocker.wait()

    task = asyncio.create_task(_background_job())
    session.register_background_task(task)

    await AgentSession.cleanup(session)

    assert task.cancelled()
    assert session.runtime.background_tasks == set()
