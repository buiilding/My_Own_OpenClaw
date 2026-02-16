import uuid

import pytest
from pydantic import ValidationError

from backend.src.sdk.context import ExecutionRuntime, SessionContext, ToolContext, UserContext
from backend.src.tools.remote import (
    RemoteMouseTool,
    RemoteToolBase,
    RemoteToolResult,
    get_all_remote_tools,
    get_remote_tool,
)
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


def test_remote_tool_result_to_dict():
    result = RemoteToolResult(
        tool_name="mouse_control",
        args={"action": "click", "x": 1, "y": 2},
        request_id="req-1",
    )

    assert result.to_dict() == {
        "tool_name": "mouse_control",
        "args": {"action": "click", "x": 1, "y": 2},
        "request_id": "req-1",
        "is_remote": True,
    }


def test_remote_tool_build_result_prefers_explicit_request_id_over_context():
    ctx = _make_context(metadata={"request_id": "metadata-id"})
    tool = RemoteMouseTool()
    args = MouseControlArgs(action="click", x=1, y=2)

    result = tool._build_remote_result(args, ctx, request_id="explicit-id")

    assert result.request_id == "explicit-id"
    assert result.args["x"] == 1
    assert result.args["y"] == 2
    assert getattr(result.args["action"], "value", result.args["action"]) == "click"
    assert "duration" in result.args


@pytest.mark.asyncio
async def test_remote_tool_run_delegates_to_execute_remote():
    class DummyRemoteTool(RemoteToolBase):
        name = "dummy_remote"

        async def execute_remote(self, args, ctx):
            return RemoteToolResult(self.name, {"echo": args}, "delegated-id")

    tool = DummyRemoteTool()
    result = await tool.run({"k": "v"}, _make_context())

    assert result.tool_name == "dummy_remote"
    assert result.request_id == "delegated-id"
    assert result.args == {"echo": {"k": "v"}}


def test_get_remote_tool_unknown_name_returns_none():
    assert get_remote_tool("does-not-exist") is None


def test_get_all_remote_tools_returns_copy():
    original = get_all_remote_tools()
    original.pop("mouse_control", None)

    fresh = get_all_remote_tools()
    assert "mouse_control" in fresh
