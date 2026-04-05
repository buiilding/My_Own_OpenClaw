from __future__ import annotations

import pytest

from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
from backend.src.core.interfaces.tool import ToolResult
from backend.src.sdk.context import (
    ExecutionRuntime,
    SessionContext,
    ToolContext,
    UserContext,
)
from backend.src.tools.computer.schemas import OpenAIComputerArgs
from backend.src.tools.remote_tools.computer import OpenAINativeComputerTool


class _FakeSession:
    def __init__(self) -> None:
        self._result_storage = ToolResultStorage()

    def get_result_storage(self) -> ToolResultStorage:
        return self._result_storage


@pytest.mark.asyncio
async def test_native_computer_bridge_emits_bundle_and_preserves_bundle_screenshot():
    session = _FakeSession()
    captured_event = None

    async def emit_streaming_event(event):
        nonlocal captured_event
        captured_event = event
        bundle_result = ToolResult(
            success=True,
            data={
                "status": "success",
                "step_results": [
                    {
                        "tool": "mouse_control",
                        "status": "ok",
                        "output": "Clicked the button.",
                    }
                ],
                "screenshot": "data:image/png;base64,bridge-shot",
                "system_state": {
                    "active_window": "Browser",
                    "mouse_position": {"x": 100, "y": 200},
                    "time": "12:00 PM",
                },
            },
        )
        session.get_result_storage().store_bundled_result(event.bundle_id, bundle_result)
        session.get_result_storage().resolve_bundle_future(event.bundle_id, bundle_result)

    ctx = ToolContext(
        user=UserContext(user_id="test-user"),
        session=SessionContext(session_id="test-session", created_at=0.0),
        runtime=ExecutionRuntime(
            workspace_root="/tmp",
            services={
                "session": session,
                "emit_streaming_event": emit_streaming_event,
            },
        ),
    )

    result = await OpenAINativeComputerTool().run(
        OpenAIComputerArgs.model_validate(
            {"actions": [{"type": "click", "x": 100, "y": 200}]}
        ),
        ctx,
    )

    assert captured_event is not None
    assert captured_event.tools == [
        {
            "name": "mouse_control",
            "args": {
                "action": "click",
                "x": 100,
                "y": 200,
                "button": "left",
                "explanation": "Execute OpenAI native computer action 1/1: click.",
            },
            "metadata": {
                "provider_native_computer_action": {"type": "click", "x": 100, "y": 200}
            },
        }
    ]
    assert result.success is True
    assert result.data["screenshot"] == "data:image/png;base64,bridge-shot"
    assert result.metadata["suppress_wrapper_events"] is True


@pytest.mark.asyncio
async def test_native_computer_bridge_rejects_modifier_mouse_actions():
    session = _FakeSession()

    async def emit_streaming_event(_event):
        raise AssertionError("bridge should fail before emitting a bundle")

    ctx = ToolContext(
        user=UserContext(user_id="test-user"),
        session=SessionContext(session_id="test-session", created_at=0.0),
        runtime=ExecutionRuntime(
            workspace_root="/tmp",
            services={
                "session": session,
                "emit_streaming_event": emit_streaming_event,
            },
        ),
    )

    result = await OpenAINativeComputerTool().run(
        OpenAIComputerArgs.model_validate(
            {"actions": [{"type": "click", "x": 100, "y": 200, "keys": ["CTRL"]}]}
        ),
        ctx,
    )

    assert result.success is False
    assert "Modifier keys on native computer mouse actions" in (result.error or "")


@pytest.mark.asyncio
async def test_native_computer_bridge_accepts_snake_case_scroll_fields():
    session = _FakeSession()
    captured_event = None

    async def emit_streaming_event(event):
        nonlocal captured_event
        captured_event = event
        bundle_result = ToolResult(
            success=True,
            data={
                "status": "success",
                "step_results": [
                    {
                        "tool": "scroll_control",
                        "status": "ok",
                        "output": "Scrolled down.",
                    }
                ],
            },
        )
        session.get_result_storage().store_bundled_result(event.bundle_id, bundle_result)
        session.get_result_storage().resolve_bundle_future(event.bundle_id, bundle_result)

    ctx = ToolContext(
        user=UserContext(user_id="test-user"),
        session=SessionContext(session_id="test-session", created_at=0.0),
        runtime=ExecutionRuntime(
            workspace_root="/tmp",
            services={
                "session": session,
                "emit_streaming_event": emit_streaming_event,
            },
        ),
    )

    result = await OpenAINativeComputerTool().run(
        OpenAIComputerArgs.model_validate(
            {
                "actions": [
                    {
                        "type": "scroll",
                        "x": 1208,
                        "y": 808,
                        "scroll_x": 0,
                        "scroll_y": 523,
                    }
                ]
            }
        ),
        ctx,
    )

    assert result.success is True
    assert captured_event is not None
    assert captured_event.tools == [
        {
            "name": "scroll_control",
            "args": {
                "action": "scroll",
                "x": 1208,
                "y": 808,
                "direction": "down",
                "clicks": 5,
                "explanation": "Execute OpenAI native computer action 1/1: scroll.",
            },
            "metadata": {
                "provider_native_computer_action": {
                    "type": "scroll",
                    "x": 1208,
                    "y": 808,
                    "scroll_x": 0,
                    "scroll_y": 523,
                }
            },
        }
    ]
