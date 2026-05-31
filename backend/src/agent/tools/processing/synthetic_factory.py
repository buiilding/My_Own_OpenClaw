"""
Synthetic Result Factory.

Creates synthetic tool results for error handling.
Pure factory: no side effects, deterministic output.
"""

import json
import logging
from typing import TYPE_CHECKING

from backend.src.core.interfaces.tool import ToolResult

if TYPE_CHECKING:
    from backend.src.llm.parser_types import ParsedToolCall

logger = logging.getLogger(__name__)


class SyntheticResultFactory:
    """
    Factory for creating synthetic tool results.

    Responsibility: Error object creation only.
    No side effects, no state mutation.
    """

    @staticmethod
    def create(tool_call: "ParsedToolCall", error_msg: str) -> ToolResult:
        """
        Create a synthetic tool result for coordinate resolution failures.

        Creates an error result that can be sent to LLM as tool output.
        No system context or screenshot needed for error results.

        Args:
            tool_call: The tool call that failed
            error_msg: Error message to include in result

        Returns:
            ToolResult with error information, pre-formatted for history
        """
        data = {"error": error_msg, "tool_name": tool_call.tool_name}
        provider_error = SyntheticResultFactory._extract_provider_error(error_msg)
        if provider_error is not None:
            data["provider_error"] = provider_error
        return ToolResult(
            success=False,
            error=error_msg,
            output=f"Error: {error_msg}",
            data=data,
        )

    @staticmethod
    def _extract_provider_error(error_msg: str) -> dict | None:
        marker = "provider_error_json="
        if marker not in error_msg:
            return None
        payload = error_msg.split(marker, 1)[1].strip()
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
