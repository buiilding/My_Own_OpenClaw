import asyncio
from unittest.mock import MagicMock

import pytest

from backend.src.agent.session.session import AgentSession
from backend.src.agent.tools.preparation.screenshot.state import ScreenshotState
from backend.src.agent.tools.preparation.storage.resolved_call_storage import (
    ResolvedToolCallStorage,
)
from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
from backend.src.core.events.bus_events import InteractionCompleted
from backend.src.core.interfaces.tool import ToolResult


@pytest.mark.asyncio
async def test_agent_session_cleanup_clears_active_state_stores() -> None:
    session = AgentSession.__new__(AgentSession)
    session.session_id = "session-1"
    session.user_id = "user-1"
    session.event_bus = MagicMock()
    session.response_parser = MagicMock()
    session.history = MagicMock()

    session._screenshot_state = ScreenshotState()
    session._screenshot_state.set_current_screenshot("shot-1", "base64-image")
    session._screenshot_state.set_current_ocr_results([{"text": "ok"}])

    session._resolved_tool_call_storage = ResolvedToolCallStorage()
    session._resolved_tool_call_storage.register("req-1", {"tool": "mouse_control"})

    session._tool_result_storage = ToolResultStorage()
    session._tool_result_storage.store_pending_result("req-1", ToolResult(success=True))
    session._tool_result_storage.store_bundled_result("bundle-1", ToolResult(success=True))

    pending_future = asyncio.get_running_loop().create_future()
    session._tool_result_futures = {"req-legacy": pending_future}
    session._pending_tool_results = {"req-legacy": {"ok": True}}
    session._bundled_results = {"bundle-legacy": {"ok": True}}

    await AgentSession.cleanup(session)

    session.event_bus.unsubscribe.assert_called_once_with(
        InteractionCompleted,
        session._on_interaction_completed,
    )
    session.response_parser.shutdown.assert_called_once()
    session.history.clear.assert_called_once()

    assert session.get_screenshot() is None
    assert session.get_ocr_results() is None
    assert session.get_current_screenshot_id() is None

    assert session._resolved_tool_call_storage.get("req-1") is None
    assert session._tool_result_storage.get_stats() == {
        "pending_results": 0,
        "result_futures": 0,
        "bundled_results": 0,
        "bundle_futures": 0,
    }

    assert pending_future.cancelled()
    assert session._tool_result_futures == {}
    assert session._pending_tool_results == {}
    assert session._bundled_results == {}
