"""Covers system tool schemas behavior in the backend test suite."""

import pytest
from pydantic import ValidationError

from backend.src.tools.system.schemas import ProcessShellCommandArgs


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


def test_process_shell_command_action_is_closed_contract() -> None:
    for action in PROCESS_ACTIONS:
        assert ProcessShellCommandArgs(action=action).action == action

    with pytest.raises(ValidationError, match="action"):
        ProcessShellCommandArgs(action="restart")
