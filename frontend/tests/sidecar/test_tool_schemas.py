"""Covers local-runtime tool schema behavior."""

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
    ProcessShellCommandArgs,
    ReadFileArgs,
    ReplaceArgs,
    ReplaceOperationArgs,
    RunShellCommandArgs,
    ScreenshotToolArgs,
    ScrollControlArgs,
    SwitchTabArgs,
    WaitToolArgs,
)

EXPLANATION = "Advance the active user task."

PROCESS_ACTIONS = (
    "list",
    "poll",
    "log",
    "write",
    "send-keys",
    "submit",
    "paste",
    "kill",
    "clear",
    "remove",
)


def test_mouse_control_requires_coordinates_for_all_actions():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="click", explanation=EXPLANATION)

    args = MouseControlArgs(action="click", x=1, y=2, explanation=EXPLANATION)
    assert args.x == 1
    assert args.y == 2


def test_mouse_control_rejects_scroll_action():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="scroll", explanation=EXPLANATION)


def test_mouse_control_drag_requires_destination_coordinates():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="drag", x=10, y=20, explanation=EXPLANATION)

    args = MouseControlArgs(
        action="drag",
        x=10,
        y=20,
        drag_to_x=30,
        drag_to_y=40,
        duration=0.5,
        explanation=EXPLANATION,
    )
    assert args.x == 10
    assert args.y == 20
    assert args.drag_to_x == 30
    assert args.drag_to_y == 40
    assert args.duration == 0.5


def test_mouse_control_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        MouseControlArgs(
            action="click", x=1, y=2, explanation=EXPLANATION, unknown_field="ignored"
        )


def test_mouse_control_accepts_button_field():
    args = MouseControlArgs(
        action="click", x=1, y=2, button="middle", explanation=EXPLANATION
    )

    assert args.button == "middle"

    with pytest.raises(ValidationError):
        MouseControlArgs(
            action="click", x=1, y=2, button="primary", explanation=EXPLANATION
        )


def test_keyboard_control_validates_action_fields_and_length():
    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="type", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="paste", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="press", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="hotkey", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="type", text="a" * 10001, explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="paste", text="a" * 10001, explanation=EXPLANATION)

    args = KeyboardControlArgs(action="type", text="hello", explanation=EXPLANATION)
    assert args.text == "hello"

    paste_args = KeyboardControlArgs(
        action="paste", text="hello", explanation=EXPLANATION
    )
    assert paste_args.text == "hello"


def test_keyboard_control_accepts_press_and_hotkey_actions():
    press_args = KeyboardControlArgs(
        action="press",
        key="Enter",
        repeat=2,
        interval_ms=25,
        explanation=EXPLANATION,
    )
    assert press_args.key == "Enter"
    assert press_args.repeat == 2
    assert press_args.interval_ms == 25

    hotkey_args = KeyboardControlArgs(
        action="hotkey", keys=["ctrl", "s"], repeat=3, explanation=EXPLANATION
    )
    assert hotkey_args.keys == ["ctrl", "s"]
    assert hotkey_args.repeat == 3


def test_keyboard_control_allows_text_length_boundary():
    args = KeyboardControlArgs(action="type", text="a" * 10000, explanation=EXPLANATION)
    assert len(args.text) == 10000

    paste_args = KeyboardControlArgs(
        action="paste", text="a" * 10000, explanation=EXPLANATION
    )
    assert len(paste_args.text) == 10000


def test_scroll_control_requires_direction_for_scroll_action():
    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll", x=100, y=200, explanation=EXPLANATION)

    args = ScrollControlArgs(
        action="scroll", x=100, y=200, direction="down", explanation=EXPLANATION
    )
    assert args.direction == "down"


def test_scroll_control_requires_manual_coordinates_for_all_actions():
    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll_up", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll_down", explanation=EXPLANATION)

    args = ScrollControlArgs(action="scroll_up", x=10, y=20, explanation=EXPLANATION)
    assert args.x == 10
    assert args.y == 20


def test_scroll_control_scroll_up_down_do_not_require_direction():
    up_args = ScrollControlArgs(action="scroll_up", x=1, y=2, explanation=EXPLANATION)
    down_args = ScrollControlArgs(
        action="scroll_down", x=3, y=4, explanation=EXPLANATION
    )

    assert up_args.direction is None
    assert down_args.direction is None


def test_scroll_control_clicks_remains_optional():
    args = ScrollControlArgs(action="scroll_down", x=3, y=4, explanation=EXPLANATION)

    assert args.clicks is None


def test_replace_args_default_context_and_matching_fields():
    args = ReplaceArgs(
        file_path="/tmp/a.txt",
        replacements=[{"old_string": "old", "new_string": "new"}],
        explanation="Update one string in the file.",
    )

    operation = args.replacements[0]
    assert operation.before_context is None
    assert operation.after_context is None
    assert operation.occurrence_index is None
    assert operation.require_eof is False
    assert args.match_mode == "lenient"


def test_shared_direct_tool_schemas_require_explanation():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="click", x=1, y=2)

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="type", text="hello")

    with pytest.raises(ValidationError):
        ScreenshotToolArgs()

    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll_down", x=1, y=2)

    with pytest.raises(ValidationError):
        SwitchTabArgs(tab_name="Terminal")

    with pytest.raises(ValidationError):
        WaitToolArgs(seconds=1.5)

    with pytest.raises(ValidationError):
        ReadFileArgs(file_path="/tmp/a.txt")

    with pytest.raises(ValidationError):
        ReplaceArgs(
            file_path="/tmp/a.txt",
            replacements=[{"old_string": "old", "new_string": "new"}],
        )

    with pytest.raises(ValidationError):
        RunShellCommandArgs(command="pwd", run_in_background=False)

    with pytest.raises(ValidationError):
        OpenAppArgs(command="notepad")

    with pytest.raises(ValidationError):
        GetOpenWindowsArgs()

    with pytest.raises(ValidationError):
        GetSystemStatsArgs()


def test_run_shell_command_rejects_legacy_output_token_limit():
    with pytest.raises(ValidationError):
        RunShellCommandArgs(
            command="pwd",
            run_in_background=False,
            explanation=EXPLANATION,
            max_output_tokens=10,
        )


def test_wait_tool_schema_requires_seconds():
    with pytest.raises(ValidationError):
        WaitToolArgs(explanation=EXPLANATION)

    args = WaitToolArgs(seconds=1.5, explanation=EXPLANATION)
    assert args.seconds == 1.5


def test_switch_window_schema_supports_match_mode():
    args = SwitchTabArgs(
        tab_name="Terminal", match_mode="contains", explanation=EXPLANATION
    )
    assert args.match_mode == "contains"

    with pytest.raises(ValidationError):
        SwitchTabArgs(
            tab_name="Terminal", match_mode="invalid", explanation=EXPLANATION
        )


def test_replace_operation_occurrence_index_must_be_positive():
    with pytest.raises(ValidationError):
        ReplaceOperationArgs(old_string="old", new_string="new", occurrence_index=0)


def test_replace_args_reject_top_level_legacy_edit_fields():
    with pytest.raises(ValidationError):
        ReplaceArgs(
            file_path="/tmp/a.txt",
            old_string="old",
            new_string="new",
            explanation="Update one string in the file.",
        )


def test_replace_args_requires_exactly_one_edit_mode():
    with pytest.raises(ValidationError, match="exactly one edit mode"):
        ReplaceArgs(
            file_path="/tmp/a.txt",
            explanation="Update one string in the file.",
        )

    with pytest.raises(ValidationError, match="exactly one edit mode"):
        ReplaceArgs(
            file_path="/tmp/a.txt",
            replacements=[{"old_string": "old", "new_string": "new"}],
            patch_chunks=[{"old_lines": ["old"], "new_lines": ["new"]}],
            explanation="Update one string in the file.",
        )


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


def test_process_shell_command_action_is_closed_contract():
    for action in PROCESS_ACTIONS:
        assert ProcessShellCommandArgs(action=action).action == action

    with pytest.raises(ValidationError, match="action"):
        ProcessShellCommandArgs(action="restart")
