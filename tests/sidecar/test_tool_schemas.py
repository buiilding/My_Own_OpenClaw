import pytest
from pydantic import ValidationError
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.schemas import (  # noqa: E402
    GetOpenWindowsArgs,
    GetSystemStatsArgs,
    KeyboardControlArgs,
    MouseControlArgs,
    OpenAppArgs,
    ReadFileArgs,
    ReplaceArgs,
    ReplaceOperationArgs,
    RunShellCommandArgs,
    ScrollControlArgs,
    WaitToolArgs,
)


def test_mouse_control_requires_coordinates_for_all_actions():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="click")

    args = MouseControlArgs(action="click", x=1, y=2)
    assert args.x == 1
    assert args.y == 2


def test_mouse_control_rejects_scroll_action():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="scroll")


def test_mouse_control_drag_requires_destination_coordinates():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="drag", x=10, y=20)

    args = MouseControlArgs(action="drag", x=10, y=20, drag_to_x=30, drag_to_y=40, duration=0.5)
    assert args.x == 10
    assert args.y == 20
    assert args.drag_to_x == 30
    assert args.drag_to_y == 40
    assert args.duration == 0.5


def test_mouse_control_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="click", x=1, y=2, unknown_field="ignored")


def test_keyboard_control_validates_action_fields_and_length():
    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="type")

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="paste")

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="press")

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="hotkey")

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="type", text="a" * 10001)

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="paste", text="a" * 10001)

    args = KeyboardControlArgs(action="type", text="hello")
    assert args.text == "hello"

    paste_args = KeyboardControlArgs(action="paste", text="hello")
    assert paste_args.text == "hello"


def test_keyboard_control_accepts_press_and_hotkey_actions():
    press_args = KeyboardControlArgs(action="press", key="Enter")
    assert press_args.key == "Enter"

    hotkey_args = KeyboardControlArgs(action="hotkey", keys=["ctrl", "s"])
    assert hotkey_args.keys == ["ctrl", "s"]


def test_keyboard_control_allows_text_length_boundary():
    args = KeyboardControlArgs(action="type", text="a" * 10000)
    assert len(args.text) == 10000

    paste_args = KeyboardControlArgs(action="paste", text="a" * 10000)
    assert len(paste_args.text) == 10000


def test_scroll_control_requires_direction_for_scroll_action():
    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll", x=100, y=200)

    args = ScrollControlArgs(action="scroll", x=100, y=200, direction="down")
    assert args.direction == "down"


def test_scroll_control_requires_manual_coordinates_for_all_actions():
    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll_up")

    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll_down")

    args = ScrollControlArgs(action="scroll_up", x=10, y=20)
    assert args.x == 10
    assert args.y == 20


def test_scroll_control_scroll_up_down_do_not_require_direction():
    up_args = ScrollControlArgs(action="scroll_up", x=1, y=2)
    down_args = ScrollControlArgs(action="scroll_down", x=3, y=4)

    assert up_args.direction is None
    assert down_args.direction is None


def test_replace_args_default_context_and_matching_fields():
    args = ReplaceArgs(
        file_path="/tmp/a.txt",
        old_string="old",
        new_string="new",
        explanation="Update one string in the file.",
    )

    assert args.before_context is None
    assert args.after_context is None
    assert args.occurrence_index is None
    assert args.require_eof is False
    assert args.match_mode == "lenient"


def test_shared_direct_tool_schemas_require_explanation():
    with pytest.raises(ValidationError):
        ReadFileArgs(file_path="/tmp/a.txt")

    with pytest.raises(ValidationError):
        ReplaceArgs(file_path="/tmp/a.txt", old_string="old", new_string="new")

    with pytest.raises(ValidationError):
        RunShellCommandArgs(command="pwd", run_in_background=False)

    with pytest.raises(ValidationError):
        OpenAppArgs(command="notepad")

    with pytest.raises(ValidationError):
        GetOpenWindowsArgs()

    with pytest.raises(ValidationError):
        GetSystemStatsArgs()


def test_wait_tool_schema_requires_seconds():
    with pytest.raises(ValidationError):
        WaitToolArgs()

    args = WaitToolArgs(seconds=1.5)
    assert args.seconds == 1.5


def test_replace_operation_occurrence_index_must_be_positive():
    with pytest.raises(ValidationError):
        ReplaceOperationArgs(old_string="old", new_string="new", occurrence_index=0)


def test_open_app_args_validate_command_and_timeout():
    args = OpenAppArgs(
        command="notepad",
        verify="window",
        verify_timeout_seconds=5.0,
        explanation="Launch Notepad so the user can edit a file.",
    )
    assert args.command == "notepad"
    assert args.verify == "window"

    with pytest.raises(ValidationError):
        OpenAppArgs(command="   ", explanation="Launch the app.")

    with pytest.raises(ValidationError):
        OpenAppArgs(
            command="notepad",
            verify_timeout_seconds=-1,
            explanation="Launch Notepad so the user can edit a file.",
        )
