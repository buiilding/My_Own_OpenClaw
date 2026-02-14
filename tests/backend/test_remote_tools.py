import uuid

import pytest
from pydantic import ValidationError

from backend.src.sdk.context import ExecutionRuntime, SessionContext, ToolContext, UserContext
from backend.src.tools.remote import RemoteMouseTool
from backend.src.tools.computer.schemas import MouseControlArgs, ScrollControlArgs


def _make_context(metadata=None):
    return ToolContext(
        user=UserContext(user_id="user-1"),
        session=SessionContext(
            session_id="session-1",
            created_at=0.0,
            metadata=metadata or {},
        ),
        runtime=ExecutionRuntime(workspace_root="/tmp", services={}),
    )


@pytest.mark.asyncio
async def test_remote_tool_uses_request_id_from_session_metadata():
    ctx = _make_context(metadata={"request_id": "req-123"})
    tool = RemoteMouseTool()
    args = MouseControlArgs(action="click", x=1, y=2)

    result = await tool.run(args, ctx)
    assert result.is_remote is True
    assert result.request_id == "req-123"
    assert result.args["action"] == "click"


@pytest.mark.asyncio
async def test_remote_tool_generates_request_id_when_missing(monkeypatch):
    monkeypatch.setattr(uuid, "uuid4", lambda: "fixed-uuid")
    ctx = _make_context()
    tool = RemoteMouseTool()
    args = MouseControlArgs(action="click", x=1, y=2)

    result = await tool.run(args, ctx)
    assert result.request_id == "fixed-uuid"


def test_scroll_control_requires_manual_coordinates():
    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll_down")

    args = ScrollControlArgs(action="scroll_down", x=10, y=20)
    assert args.x == 10
    assert args.y == 20


def test_scroll_control_requires_direction_for_scroll_action():
    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll", x=10, y=20)

    args = ScrollControlArgs(action="scroll", x=10, y=20, direction="down")
    assert args.direction == "down"
