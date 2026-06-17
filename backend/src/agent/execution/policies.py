"""Execution policies for the interaction loop."""
from __future__ import annotations


class ToolExecutionPolicy:
    """Execution behavior policies for tool turns."""

    @staticmethod
    def is_bundle(tool_call_count: int) -> bool:
        return tool_call_count > 1
