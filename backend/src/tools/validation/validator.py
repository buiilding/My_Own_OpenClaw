"""
Tool Call Validator.

Validates tool calls before execution.
"""
import logging
from typing import Tuple

from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class ToolValidator:
    """
    Validates tool calls before execution.
    """

    def __init__(self, tool_registry: ToolRegistry):
        """
        Initialize the validator.

        Args:
            tool_registry: ToolRegistry instance for tool lookup
        """
        self.tool_registry = tool_registry

    def validate_tool_call(self, tool_call: ParsedToolCall) -> Tuple[bool, str]:
        """
        Validate a tool call before execution.

        Args:
            tool_call: The tool call to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check if tool exists
        if not self.tool_registry.is_tool_available(tool_call.tool_name):
            return False, f"Tool '{tool_call.tool_name}' is not available"

        # Get tool and validate parameters using Pydantic
        tool = self.tool_registry.get_tool(tool_call.tool_name)
        if not tool:
            return False, f"Tool '{tool_call.tool_name}' could not be retrieved"

        # Validate parameters using Pydantic
        try:
            tool.args_model(**tool_call.parameters)
            return True, ""
        except Exception as e:
            error_msg = f"Parameter validation failed: {str(e)}"
            return False, error_msg
