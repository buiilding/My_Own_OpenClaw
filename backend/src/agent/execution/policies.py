"""Execution policies for the interaction loop."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class IterationPolicy:
    """Controls max-iteration and extra-turn behavior for tool loops."""

    max_iterations: int
    in_extra_turn_after_final_tools: bool = False

    def begin_next_iteration(self, iteration: int) -> int:
        return iteration + 1

    def should_continue(self, iteration: int) -> bool:
        return iteration < self.max_iterations or self.in_extra_turn_after_final_tools

    def mark_tool_execution(self, iteration: int) -> None:
        if iteration >= self.max_iterations:
            self.in_extra_turn_after_final_tools = True

    def can_execute_tools(self) -> bool:
        return not self.in_extra_turn_after_final_tools

    def reached_hard_limit(self, iteration: int) -> bool:
        return iteration >= self.max_iterations and not self.in_extra_turn_after_final_tools


class ParseRecoveryPolicy:
    """Builds corrective user-facing/system-facing messages after parser failures."""

    @staticmethod
    def build_validation_error_user_message(error_details: str) -> str:
        return (
            f"[System Validation Error: {error_details}]\n\n"
            "Your tool call format was invalid. "
            "For computer-use actions, use the unified computer_use tool and include metadata. "
            "For system/filesystem actions, use the unified system_use tool with tool + explanation + arguments envelope. "
            "you MUST use this format:\n"
            '{"functionCall": {"name": "computer_use", "args": {"tool": "mouse_control", "metadata": {"description": "...", "explanation": "...", "expectation": "..."}, "arguments": {...}}}}\n\n'
            '{"functionCall": {"name": "system_use", "args": {"tool": "run_shell_command", "explanation": "...", "arguments": {...}}}}\n\n'
            "Direct functionCall format is required. "
            "Please correct your format and try again."
        )


class ToolExecutionPolicy:
    """Execution behavior policies for tool turns."""

    @staticmethod
    def is_bundle(tool_call_count: int) -> bool:
        return tool_call_count > 1
