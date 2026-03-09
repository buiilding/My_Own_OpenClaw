"""Timeout resolution helpers for frontend tool-result waits."""

from __future__ import annotations

import math

from backend.src.llm.parser_types import ParsedToolCall

DEFAULT_FRONTEND_WAIT_TIMEOUT_SECONDS = 120.0
MAX_FRONTEND_WAIT_TIMEOUT_SECONDS = 900.0
FRONTEND_WAIT_SAFETY_BUFFER_SECONDS = 15.0
_RUN_SHELL_COMMAND_TOOL_NAME = "run_shell_command"


def _as_positive_seconds(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if not isinstance(value, (int, float)):
        return None
    normalized = float(value)
    if not math.isfinite(normalized) or normalized <= 0:
        return None
    return normalized


def _resolve_shell_foreground_wait_timeout_seconds(
    tool_call: ParsedToolCall,
) -> float | None:
    if tool_call.tool_name != _RUN_SHELL_COMMAND_TOOL_NAME:
        return None
    parameters = tool_call.parameters if isinstance(tool_call.parameters, dict) else {}
    if parameters.get("run_in_background") is True:
        return None

    terminate_after_seconds = _as_positive_seconds(
        parameters.get("terminate_after_seconds")
    )
    post_action_wait_seconds = _as_positive_seconds(parameters.get("wait")) or 0.0
    requested_seconds = (
        terminate_after_seconds
        if terminate_after_seconds is not None
        else DEFAULT_FRONTEND_WAIT_TIMEOUT_SECONDS
    )
    candidate = (
        requested_seconds
        + post_action_wait_seconds
        + FRONTEND_WAIT_SAFETY_BUFFER_SECONDS
    )
    return min(MAX_FRONTEND_WAIT_TIMEOUT_SECONDS, candidate)


def resolve_single_tool_wait_timeout_seconds(tool_call: ParsedToolCall) -> float:
    shell_wait_timeout = _resolve_shell_foreground_wait_timeout_seconds(tool_call)
    if shell_wait_timeout is None:
        return DEFAULT_FRONTEND_WAIT_TIMEOUT_SECONDS
    return max(DEFAULT_FRONTEND_WAIT_TIMEOUT_SECONDS, shell_wait_timeout)


def resolve_bundle_wait_timeout_seconds(tool_calls: list[ParsedToolCall]) -> float:
    shell_timeout_sum = 0.0
    for tool_call in tool_calls:
        shell_wait_timeout = _resolve_shell_foreground_wait_timeout_seconds(tool_call)
        if shell_wait_timeout is not None:
            shell_timeout_sum += shell_wait_timeout

    if shell_timeout_sum <= 0:
        return DEFAULT_FRONTEND_WAIT_TIMEOUT_SECONDS
    return min(
        MAX_FRONTEND_WAIT_TIMEOUT_SECONDS,
        max(DEFAULT_FRONTEND_WAIT_TIMEOUT_SECONDS, shell_timeout_sum),
    )
