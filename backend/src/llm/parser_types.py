"""
Parser data structures and schema helpers.
"""
import copy
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


_COMPUTER_USE_TOOL_NAME = "computer_use"
_COMPUTER_SUBTOOLS = {
    "mouse_control",
    "keyboard_control",
    "screenshot",
    "scroll_control",
    "switch_tab",
    "wait",
}
_SYSTEM_USE_TOOL_NAME = "system_use"
_SYSTEM_SUBTOOLS = {
    "run_shell_command",
    "replace",
    "replace_file",
    "read_file",
    "get_system_stats",
    "get_open_windows",
}
_SYSTEM_SUBTOOL_ALIAS_TO_CONCRETE = {
    "replace_file": "replace",
}


@dataclass
class ParsedToolCall:
    """Represents a parsed tool call from an LLM response."""

    tool_name: str
    parameters: Dict[str, Any]
    raw_call: str = ""
    confidence: float = 1.0  # 0.0 to 1.0, how confident we are in this parse
    metadata: Optional[Dict[str, Any]] = None  # Metadata for computer-use tools


@dataclass
class ParsedResponse:
    """Structured data extracted from LLM response."""

    original_response: str
    tool_calls: List[ParsedToolCall]
    text_content: str  # The non-tool-call content
    has_tool_calls: bool = False


@dataclass
class ToolCallSchema:
    """
    Configuration for tool call JSON format.

    Allows parser to support different JSON schemas while defaulting to
    the custom format: {"functionCall": {"name": "...", "args": {...}}}
    """

    root_key: str = "functionCall"
    name_key: str = "name"
    args_key: str = "args"

    def _extract_name_and_args(
        self,
        function_call: Dict[str, Any],
    ) -> Optional[Tuple[str, Dict[str, Any]]]:
        """Extract and validate tool name/args from a function call payload."""
        if not isinstance(function_call, dict):
            return None

        tool_name = function_call.get(self.name_key)
        args = function_call.get(self.args_key, {})

        if not isinstance(tool_name, str) or not tool_name.strip():
            return None
        normalized_tool_name = tool_name.strip()

        if not isinstance(args, dict):
            return None

        return normalized_tool_name, copy.deepcopy(args)

    def extract_tool_call(
        self, parsed_json: Dict[str, Any]
    ) -> Optional[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]]:
        """
        Extract tool name, args, and metadata from parsed JSON.

        Args:
            parsed_json: Parsed JSON dictionary

        Returns:
            Tuple of (tool_name, args_dict, metadata_dict) or None if not a valid tool call
            - metadata_dict is extracted from `args.metadata` when present
        """
        if not isinstance(parsed_json, dict):
            return None

        # Standard format: direct functionCall only.
        if self.root_key in parsed_json:
            extracted = self._extract_name_and_args(parsed_json[self.root_key])
            if extracted is None:
                return None
            normalized_tool_name, args = extracted
            metadata = self._extract_metadata_from_args(args)

            if normalized_tool_name == _COMPUTER_USE_TOOL_NAME:
                normalized = self._normalize_unified_computer_use(args, metadata)
                if normalized is None:
                    return None
                return normalized
            if normalized_tool_name == _SYSTEM_USE_TOOL_NAME:
                normalized = self._normalize_unified_system_use(args, metadata)
                if normalized is None:
                    return None
                return normalized

            return (normalized_tool_name, args, metadata)

        return None

    @staticmethod
    def _extract_metadata_from_args(args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        metadata_value = args.get("metadata")
        if not isinstance(metadata_value, dict):
            return None
        args.pop("metadata", None)
        return copy.deepcopy(metadata_value)

    @staticmethod
    def _normalize_unified_computer_use(
        args: Dict[str, Any],
        metadata: Optional[Dict[str, Any]],
    ) -> Optional[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]]:
        tool_name = args.get("tool")
        if not isinstance(tool_name, str):
            return None
        normalized_tool_name = tool_name.strip()
        if not normalized_tool_name or normalized_tool_name not in _COMPUTER_SUBTOOLS:
            return None

        arguments = args.get("arguments")
        if arguments is None:
            arguments = {}
        if not isinstance(arguments, dict):
            return None

        return normalized_tool_name, copy.deepcopy(arguments), metadata

    @staticmethod
    def _normalize_unified_system_use(
        args: Dict[str, Any],
        metadata: Optional[Dict[str, Any]],
    ) -> Optional[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]]:
        tool_name = args.get("tool")
        if not isinstance(tool_name, str):
            return None
        normalized_tool_name = tool_name.strip()
        if not normalized_tool_name or normalized_tool_name not in _SYSTEM_SUBTOOLS:
            return None
        normalized_tool_name = _SYSTEM_SUBTOOL_ALIAS_TO_CONCRETE.get(
            normalized_tool_name,
            normalized_tool_name,
        )

        arguments = args.get("arguments")
        if arguments is None:
            arguments = {}
        if not isinstance(arguments, dict):
            return None

        return normalized_tool_name, copy.deepcopy(arguments), metadata
