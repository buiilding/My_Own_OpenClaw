"""Covers remote tools behavior in the backend test suite."""

import uuid

import pytest
from pydantic import ValidationError

from backend.src.core.security.policy import Permission
from backend.src.sdk.context import (
    ExecutionRuntime,
    SessionContext,
    ToolContext,
    UserContext,
)
from backend.src.tools.computer.schemas import (
    KeyboardControlArgs,
    MouseControlArgs,
    ScrollControlArgs,
    SwitchTabArgs,
    WaitToolArgs,
)
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult
from backend.src.tools.remote_tools.computer import RemoteMouseTool, RemoteWaitTool
from backend.src.tools.tool_catalog import (
    get_all_remote_tool_classes,
    get_remote_tool_class,
)

EXPLANATION = "Advance the active user task."


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
    args = MouseControlArgs(action="click", x=1, y=2, explanation=EXPLANATION)

    result = await tool.run(args, ctx)
    assert result.is_remote is True
    assert result.request_id == "req-123"
    assert result.args["action"] == "click"


@pytest.mark.asyncio
async def test_remote_wait_tool_uses_session_request_id_for_sdk_correlation():
    ctx = _make_context(metadata={"request_id": "req-wait-123"})
    wait_tool = RemoteWaitTool()
    mouse_tool = RemoteMouseTool()

    wait_result = await wait_tool.run(
        WaitToolArgs(seconds=2, explanation=EXPLANATION), ctx
    )
    mouse_result = await mouse_tool.run(
        MouseControlArgs(action="click", x=1, y=2, explanation=EXPLANATION),
        ctx,
    )

    assert wait_result.tool_name == "wait"
    assert wait_result.request_id == "req-wait-123"
    assert mouse_result.request_id == "req-wait-123"


@pytest.mark.asyncio
async def test_remote_tool_generates_request_id_when_missing(monkeypatch):
    monkeypatch.setattr(uuid, "uuid4", lambda: "fixed-uuid")
    ctx = _make_context()
    tool = RemoteMouseTool()
    args = MouseControlArgs(action="click", x=1, y=2, explanation=EXPLANATION)

    result = await tool.run(args, ctx)
    assert result.request_id == "fixed-uuid"


def test_scroll_control_requires_manual_coordinates_when_find_coordinates_by_is_manual():
    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll_down", explanation=EXPLANATION)

    args = ScrollControlArgs(action="scroll_down", x=10, y=20, explanation=EXPLANATION)
    assert args.x == 10
    assert args.y == 20


def test_mouse_control_accepts_button_field():
    args = MouseControlArgs(
        action="click", x=10, y=20, button="middle", explanation=EXPLANATION
    )

    assert args.button == "middle"


def test_scroll_control_accepts_ocr_grounding():
    args = ScrollControlArgs(
        action="scroll_down",
        find_coordinates_by="ocr",
        ocr_text="Sidebar",
        explanation=EXPLANATION,
    )
    assert args.find_coordinates_by == "ocr"
    assert args.ocr_text == "Sidebar"


def test_scroll_control_accepts_prediction_grounding():
    args = ScrollControlArgs(
        action="scroll_down",
        find_coordinates_by="prediction",
        source_description="the left sidebar list area",
        explanation=EXPLANATION,
    )
    assert args.find_coordinates_by == "prediction"
    assert args.source_description == "the left sidebar list area"


def test_scroll_control_requires_direction_for_scroll_action():
    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll", x=10, y=20, explanation=EXPLANATION)

    args = ScrollControlArgs(
        action="scroll", x=10, y=20, direction="down", explanation=EXPLANATION
    )
    assert args.direction == "down"


def test_scroll_control_clicks_is_optional():
    args = ScrollControlArgs(action="scroll_down", x=10, y=20, explanation=EXPLANATION)

    assert args.clicks is None


def test_keyboard_control_requires_action_specific_fields():
    with pytest.raises(
        ValidationError,
        match="text parameter required for type or paste action",
    ):
        KeyboardControlArgs(action="type", explanation=EXPLANATION)

    with pytest.raises(
        ValidationError,
        match="text parameter required for type or paste action",
    ):
        KeyboardControlArgs(action="paste", explanation=EXPLANATION)

    with pytest.raises(
        ValidationError, match="key parameter required for press action"
    ):
        KeyboardControlArgs(action="press", explanation=EXPLANATION)

    with pytest.raises(
        ValidationError, match="keys parameter required for hotkey action"
    ):
        KeyboardControlArgs(action="hotkey", explanation=EXPLANATION)


def test_keyboard_control_rejects_text_over_length_limit():
    with pytest.raises(
        ValidationError,
        match="Text too long: 10001 characters \\(max 10000\\)",
    ):
        KeyboardControlArgs(action="type", text="x" * 10001, explanation=EXPLANATION)

    with pytest.raises(
        ValidationError,
        match="Text too long: 10001 characters \\(max 10000\\)",
    ):
        KeyboardControlArgs(action="paste", text="x" * 10001, explanation=EXPLANATION)


def test_keyboard_control_accepts_repeat_and_interval_fields():
    args = KeyboardControlArgs(
        action="press",
        key="enter",
        repeat=3,
        interval_ms=40,
        explanation=EXPLANATION,
    )

    assert args.repeat == 3
    assert args.interval_ms == 40


def test_switch_window_args_accept_match_mode():
    args = SwitchTabArgs(
        tab_name="Canva",
        match_mode="contains",
        explanation=EXPLANATION,
    )

    assert args.match_mode == "contains"


def test_scroll_control_requires_ocr_target_when_using_ocr():
    with pytest.raises(ValidationError):
        ScrollControlArgs(
            action="scroll_down", find_coordinates_by="ocr", explanation=EXPLANATION
        )


def test_scroll_control_requires_prediction_description_when_using_prediction():
    with pytest.raises(ValidationError):
        ScrollControlArgs(
            action="scroll_down",
            find_coordinates_by="prediction",
            explanation=EXPLANATION,
        )


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
    args = MouseControlArgs(action="click", x=1, y=2, explanation=EXPLANATION)

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
    assert get_remote_tool_class("does-not-exist") is None


def test_get_remote_tool_open_app_exists():
    tool_class = get_remote_tool_class("open_app")
    assert tool_class is not None


def test_get_all_remote_tool_classes_returns_copy():
    original = get_all_remote_tool_classes()
    original.pop("mouse_control", None)

    fresh = get_all_remote_tool_classes()
    assert "mouse_control" in fresh


def test_sensitive_remote_tools_declare_required_permissions():
    expected_permissions = {
        "read_file": {Permission.READ_FILESYSTEM},
        "replace": {Permission.READ_FILESYSTEM, Permission.WRITE_FILESYSTEM},
        "run_shell_command": {Permission.EXECUTE_COMMANDS},
        "process": {Permission.EXECUTE_COMMANDS},
    }

    for tool_name, permissions in expected_permissions.items():
        tool_class = get_remote_tool_class(tool_name)
        assert tool_class is not None
        assert set(tool_class().required_permissions) == permissions


def test_remote_mouse_tool_schema_explicitly_guides_ocr_for_text_targets():
    tool = RemoteMouseTool()
    schema = tool.get_json_schema()
    parameters = schema["parameters"]["properties"]

    assert (
        schema["description"]
        == "Control mouse actions with schema-guided coordinate targeting."
    )
    assert (
        parameters["find_coordinates_by"]["description"]
        == "Coordinate targeting method."
    )
    assert (
        parameters["ocr_text"]["description"]
        == "Exact visible on-screen text for OCR targeting."
    )
    assert "Beware of the mouse position on the image" in parameters["x"]["description"]
    assert "Beware of the mouse position on the image" in parameters["y"]["description"]


def test_direct_remote_tool_schema_uses_flat_internal_shape():
    schema = get_remote_tool_class("run_shell_command")().get_json_schema()

    assert schema["type"] == "function"
    assert schema["name"] == "run_shell_command"
    assert "parameters" in schema
    assert "max_output_tokens" not in schema["parameters"]["properties"]
