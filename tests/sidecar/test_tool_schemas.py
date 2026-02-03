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


def test_scroll_control_requires_direction_for_scroll_action():
    with pytest.raises(ValidationError):
        ScrollControlArgs(action="scroll")

    args = ScrollControlArgs(action="scroll", direction="down")
    assert args.direction == "down"
