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
            "For computer-use tools (mouse_control, keyboard_control, screenshot, scroll_control, switch_tab, wait), "
            "you MUST use this format:\n"
            '{"metadata": {"description": "...", "explanation": "...", "expectation": "..."}, '
            '"action": {"functionCall": {"name": "tool_name", "args": {...}}}}\n\n'
            "Metadata MUST come first, otherwise the tool call will be rejected. "
            "Please correct your format and try again."
        )


class ToolExecutionPolicy:
    """Execution behavior policies for tool turns."""

    @staticmethod
    def is_bundle(tool_call_count: int) -> bool:
        return tool_call_count > 1
