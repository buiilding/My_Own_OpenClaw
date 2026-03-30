"""Execution policies for the interaction loop."""
from __future__ import annotations


class ParseRecoveryPolicy:
    """Builds corrective user-facing/system-facing messages after parser failures."""

    @staticmethod
    def build_validation_error_user_message(error_details: str) -> str:
        return (
            f"[System Validation Error: {error_details}]\n\n"
            "Your tool call format was invalid. "
            "Use direct tool names and pass only the fields defined by the active tool schema. "
            "Examples:\n"
            '{"functionCall": {"name": "mouse_control", "args": {"action": "click", "find_coordinates_by": "ocr", "ocr_text": "Save"}}}\n\n'
            '{"functionCall": {"name": "run_shell_command", "args": {"command": "pwd", "run_in_background": false, "explanation": "Check the current workspace."}}}\n\n'
            "Direct functionCall format is required. "
            "Please correct your format and try again."
        )


class ToolExecutionPolicy:
    """Execution behavior policies for tool turns."""

    @staticmethod
    def is_bundle(tool_call_count: int) -> bool:
        return tool_call_count > 1
