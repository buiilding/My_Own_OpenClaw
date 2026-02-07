"""Parser validation helpers."""
from typing import Any, Dict, List, Optional
import json
import logging

from backend.src.core.infrastructure.exceptions import ParseValidationError

logger = logging.getLogger(__name__)


class ToolCallValidator:
    """Validates tool calls and metadata for security constraints."""

    def __init__(self, config, tool_registry, metrics, limits) -> None:
        self.config = config
        self.tool_registry = tool_registry
        self.metrics = metrics
        self.limits = limits
        self._allowed_tools = config.get_tool_allowlist()
        self._allowed_tools_set = (
            set(self._allowed_tools) if self._allowed_tools is not None else None
        )

    def validate_tool_call(self, tool_name: str, args: Dict[str, Any]) -> None:
        """
        Validate a tool call for security.
        """
        validation_errors = self._collect_tool_call_validation_errors(tool_name, args)

        if validation_errors:
            self.metrics.record_validation_violation(
                validation_errors=validation_errors,
                boundary_name="response_parser",
                metadata={
                    "tool_name": tool_name,
                    "param_count": self._safe_count(args),
                },
            )
            raise ParseValidationError(
                f"Tool call validation failed: {', '.join(validation_errors)}",
                validation_errors=validation_errors,
                boundary_name="response_parser",
            )

    def _collect_tool_call_validation_errors(
        self, tool_name: str, args: Dict[str, Any]
    ) -> List[str]:
        validation_errors: List[str] = []

        if not isinstance(tool_name, str):
            validation_errors.append(
                f"Tool name must be a string, got {type(tool_name).__name__}"
            )
        elif not tool_name.strip():
            validation_errors.append("Tool name cannot be empty or whitespace")
        elif len(tool_name) > self.limits.max_tool_name_length:
            validation_errors.append(
                f"Tool name length {len(tool_name)} exceeds maximum {self.limits.max_tool_name_length}"
            )

        valid_tool_names = self._get_valid_tool_names()
        valid_tool_name_set = set(valid_tool_names)
        if tool_name not in valid_tool_name_set:
            if len(valid_tool_names) <= 15:
                tools_display = ", ".join(valid_tool_names)
            else:
                tools_display = (
                    f"{', '.join(valid_tool_names[:10])}... "
                    f"(and {len(valid_tool_names) - 10} more)"
                )
            validation_errors.append(
                f"Tool name '{tool_name}' is not in whitelist. "
                f"Valid tools ({len(valid_tool_names)}): {tools_display}"
            )

        if not isinstance(args, dict):
            validation_errors.append(
                f"Tool args must be an object/dict, got {type(args).__name__}"
            )
            return validation_errors

        if len(args) > self.limits.max_parameter_count:
            validation_errors.append(
                f"Parameter count {len(args)} exceeds maximum {self.limits.max_parameter_count}"
            )

        for param_name, param_value in args.items():
            if isinstance(param_value, str):
                if len(param_value) > self.limits.max_parameter_value_size:
                    validation_errors.append(
                        f"Parameter '{param_name}' value size {len(param_value)} "
                        f"exceeds maximum {self.limits.max_parameter_value_size}"
                    )
            elif isinstance(param_value, (dict, list)):
                serialized_size = self._serialized_param_size(param_value)
                if (
                    serialized_size is not None
                    and serialized_size > self.limits.max_parameter_value_size
                ):
                    validation_errors.append(
                        f"Parameter '{param_name}' serialized size exceeds "
                        f"maximum {self.limits.max_parameter_value_size}"
                    )

        return validation_errors

    @staticmethod
    def _serialized_param_size(param_value: Any) -> Optional[int]:
        """Return compact JSON serialized size for dict/list parameter values."""
        try:
            # Compact separators avoid inflating payload sizes with whitespace.
            serialized = json.dumps(
                param_value,
                separators=(",", ":"),
                ensure_ascii=False,
            )
            return len(serialized)
        except (TypeError, ValueError):
            return None

    def _get_valid_tool_names(self) -> List[str]:
        raw_tool_names = self.tool_registry.get_tool_names() or []
        if isinstance(raw_tool_names, (str, bytes, dict)):
            raw_tool_names = []
        elif not isinstance(raw_tool_names, (list, tuple, set)):
            try:
                raw_tool_names = list(raw_tool_names)
            except TypeError:
                raw_tool_names = []
        valid_tool_names = [
            name for name in raw_tool_names if isinstance(name, str)
        ]
        deduped_tool_names = list(dict.fromkeys(valid_tool_names))
        if self._allowed_tools_set is not None:
            deduped_tool_names = [
                name for name in deduped_tool_names if name in self._allowed_tools_set
            ]
        return sorted(deduped_tool_names)

    def validate_metadata(
        self, tool_name: str, metadata: Optional[Dict[str, Any]]
    ) -> None:
        """
        Validate metadata for computer-use tools.

        SECURITY: Computer-use tools MUST have metadata with required fields.
        """
        is_computer_use = self._is_computer_use_tool(tool_name)

        if not is_computer_use:
            if metadata is not None:
                logger.debug(
                    f"Non-computer-use tool '{tool_name}' has metadata (will be ignored)"
                )
            return

        validation_errors = []

        if metadata is None:
            validation_errors.append(
                f"Computer-use tool '{tool_name}' is missing metadata. "
                "Metadata MUST be generated first before the action. "
                "Format: {\"metadata\": {\"explanation\": \"...\", \"expectation\": \"...\"}, \"action\": {...}}"
            )
        elif not isinstance(metadata, dict):
            validation_errors.append(
                f"Computer-use tool '{tool_name}' has invalid metadata type: {type(metadata).__name__}. "
                "Metadata must be a dictionary."
            )
        else:
            if not self._has_nonempty_text(metadata.get("description")):
                validation_errors.append(
                    f"Computer-use tool '{tool_name}' is missing required metadata field 'description'. "
                    "Description describes the most recent screenshot provided to you."
                )

            if not self._has_nonempty_text(metadata.get("explanation")):
                validation_errors.append(
                    f"Computer-use tool '{tool_name}' is missing required metadata field 'explanation'. "
                    "Explanation describes why this tool is being used."
                )

            if not self._has_nonempty_text(metadata.get("expectation")):
                validation_errors.append(
                    f"Computer-use tool '{tool_name}' is missing required metadata field 'expectation'. "
                    "Expectation describes what you expect to see after execution."
                )

        if validation_errors:
            self.metrics.record_validation_violation(
                validation_errors=validation_errors,
                boundary_name="response_parser",
                metadata={"tool_name": tool_name, "has_metadata": metadata is not None},
            )
            raise ParseValidationError(
                f"Metadata validation failed for computer-use tool '{tool_name}': {', '.join(validation_errors)}",
                validation_errors=validation_errors,
                boundary_name="response_parser",
            )

    def _is_computer_use_tool(self, tool_name: str) -> bool:
        from backend.src.tools.categorization import ToolDomain

        tool = self.tool_registry.get_tool(tool_name)
        if tool and hasattr(tool, "category"):
            return tool.category == ToolDomain.COMPUTER
        return False

    @staticmethod
    def _has_nonempty_text(value: Any) -> bool:
        return isinstance(value, str) and bool(value.strip())

    @staticmethod
    def _safe_count(value: Any) -> Optional[int]:
        """Return len(value) when available, otherwise None."""
        try:
            return len(value)
        except TypeError:
            return None
