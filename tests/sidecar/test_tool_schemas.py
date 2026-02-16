import sys
from pathlib import Path

import pytest
from pydantic import ValidationError


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from tools.schemas import (  # noqa: E402
    KeyboardControlArgs,
    MouseControlArgs,
    ScrollControlArgs,
)


def test_mouse_control_requires_coordinates_for_non_scroll():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="click")

    args = MouseControlArgs(action="click", x=1, y=2)
    assert args.x == 1
    assert args.y == 2


def test_mouse_control_requires_scroll_amount_for_scroll():
    with pytest.raises(ValidationError):
        MouseControlArgs(action="scroll", scroll_direction="vertical")

    args = MouseControlArgs(action="scroll", scroll_amount=3)
    assert args.scroll_amount == 3


def test_mouse_control_scroll_allows_missing_coordinates():
    args = MouseControlArgs(action="scroll", scroll_amount=5)
    assert args.x is None
    assert args.y is None
    assert args.scroll_amount == 5


def test_mouse_control_ignores_unknown_fields():
    args = MouseControlArgs(action="click", x=1, y=2, unknown_field="ignored")
    assert args.x == 1
    assert args.y == 2
    assert not hasattr(args, "unknown_field")


def test_keyboard_control_validates_action_fields_and_length():
    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="type")

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="press")

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="hotkey")

    with pytest.raises(ValidationError):
        KeyboardControlArgs(action="type", text="a" * 10001)

    args = KeyboardControlArgs(action="type", text="hello")
    assert args.text == "hello"


def test_keyboard_control_accepts_press_and_hotkey_actions():
    press_args = KeyboardControlArgs(action="press", key="Enter")
    assert press_args.key == "Enter"

    hotkey_args = KeyboardControlArgs(action="hotkey", keys=["ctrl", "s"])
    assert hotkey_args.keys == ["ctrl", "s"]


def test_keyboard_control_allows_text_length_boundary():
    args = KeyboardControlArgs(action="type", text="a" * 10000)
    assert len(args.text) == 10000


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
