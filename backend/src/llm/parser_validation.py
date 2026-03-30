"""Parser validation helpers."""
from typing import Any, Dict, List, Optional
import json
import logging

from backend.src.core.infrastructure.exceptions import ParseValidationError
from backend.src.tools.tool_policy import ToolPolicy

logger = logging.getLogger(__name__)


class ToolCallValidator:
    """Validates tool calls and metadata for security constraints."""

    def __init__(self, config, tool_registry, metrics, limits) -> None:
        self.config = config
        self.tool_registry = tool_registry
        self.metrics = metrics
        self.limits = limits
        self._tool_policy = ToolPolicy.from_config(config)
        # Backward-compatible test seam; some tests override this directly.
        self._dev_tool_selection = self._tool_policy.selection
        self._valid_tool_name_cache_selection = None
        self._valid_tool_name_cache: Optional[
            tuple[List[str], set[str]]
        ] = None

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

        valid_tool_names, valid_tool_name_set = self._get_valid_tool_name_index()
        tool_name_is_string = isinstance(tool_name, str)
        tool_is_whitelisted = tool_name_is_string and tool_name in valid_tool_name_set
        if tool_name_is_string and not tool_is_whitelisted:
            tools_display = self._format_tool_whitelist_preview(valid_tool_names)
            validation_errors.append(
                f"Tool name '{tool_name}' is not in whitelist. "
                f"Valid tools ({len(valid_tool_names)}): {tools_display}"
            )

        if not isinstance(args, dict):
            validation_errors.append(
                f"Tool args must be an object/dict, got {type(args).__name__}"
            )
            return validation_errors

        if tool_is_whitelisted:
            validation_errors.extend(
                self._collect_method_level_validation_errors(tool_name, args)
            )

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

    def _collect_method_level_validation_errors(
        self,
        tool_name: str,
        args: Dict[str, Any],
    ) -> List[str]:
        """
        Collect tool-specific validation errors (dev-time method filtering).

        Applies currently to mouse_control.find_coordinates_by.
        """
        if tool_name != "mouse_control":
            return []

        return self._tool_policy.get_method_validation_errors(
            tool_name=tool_name,
            args=args,
            selection=self._dev_tool_selection,
        )

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

    def _compute_valid_tool_names(self) -> List[str]:
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
        deduped_tool_names = sorted(set(valid_tool_names))
        filtered_tool_names = self._tool_policy.filter_tool_names(
            deduped_tool_names,
            selection=self._dev_tool_selection,
        )
        return filtered_tool_names

    def _compute_allowed_tool_name_set(self, display_tool_names: List[str]) -> set[str]:
        return set(display_tool_names)

    def _get_valid_tool_name_index(self) -> tuple[List[str], set[str]]:
        """
        Return cached valid tool names + set for repeated per-call lookups.

        Cache is scoped to the current dev selection object. Some tests mutate
        `_dev_tool_selection` directly; this guard preserves deterministic behavior.
        """
        selection = self._dev_tool_selection
        if (
            self._valid_tool_name_cache is not None
            and self._valid_tool_name_cache_selection is selection
        ):
            return self._valid_tool_name_cache

        valid_tool_names = self._compute_valid_tool_names()
        valid_tool_name_set = self._compute_allowed_tool_name_set(valid_tool_names)
        self._valid_tool_name_cache = (valid_tool_names, valid_tool_name_set)
        self._valid_tool_name_cache_selection = selection
        return self._valid_tool_name_cache

    def _get_valid_tool_names(self) -> List[str]:
        valid_tool_names, _valid_tool_name_set = self._get_valid_tool_name_index()
        return list(valid_tool_names)

    @staticmethod
    def _format_tool_whitelist_preview(valid_tool_names: List[str]) -> str:
        """Format human-readable whitelist preview for validation error messages."""
        if len(valid_tool_names) <= 15:
            return ", ".join(valid_tool_names)
        return (
            f"{', '.join(valid_tool_names[:10])}... "
            f"(and {len(valid_tool_names) - 10} more)"
        )

    def validate_metadata(
        self, tool_name: str, metadata: Optional[Dict[str, Any]]
    ) -> None:
        _ = tool_name
        if metadata is not None and not isinstance(metadata, dict):
            validation_errors = [
                f"Tool metadata must be an object when present, got {type(metadata).__name__}"
            ]
            self.metrics.record_validation_violation(
                validation_errors=validation_errors,
                boundary_name="response_parser",
                metadata={"tool_name": tool_name, "has_metadata": True},
            )
            raise ParseValidationError(
                validation_errors[0],
                validation_errors=validation_errors,
                boundary_name="response_parser",
            )

    @staticmethod
    def _safe_count(value: Any) -> Optional[int]:
        """Return len(value) when available, otherwise None."""
        try:
            return len(value)
        except TypeError:
            return None
