"""
Tool policy service.

Centralizes decisions for:
- Tool visibility (interaction mode allowlist + dev selection)
- Tool schema filtering for prompt injection
- Mouse coordinate-method validation (manual/ocr/prediction)
- Startup gating for optional OCR and vision initialization
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
import logging
from typing import Any, Dict, List, Optional, Sequence

from backend.src.core.utils.coordinate_methods import normalize_coordinate_method
from backend.src.tools.tool_selection import ToolSelection, load_tool_selection

logger = logging.getLogger(__name__)

_UNSET = object()
_MOUSE_COORD_METHODS: tuple[str, ...] = ("manual", "ocr", "prediction")
_MODEL_MOUSE_COORD_METHODS: frozenset[str] = frozenset({"ocr"})


@dataclass(slots=True)
class ToolPolicy:
    """Central policy evaluator for tool exposure and method-level constraints."""

    config: Any
    selection: Optional[ToolSelection]

    @classmethod
    def from_config(cls, config: Any) -> "ToolPolicy":
        """Build policy from runtime config + dev tool selection file."""
        selection: Optional[ToolSelection]
        try:
            selection = load_tool_selection()
        except Exception:
            logger.debug("Failed to load dev tool selection; continuing without it.", exc_info=True)
            selection = None
        return cls(config=config, selection=selection)

    def filter_tool_names(
        self,
        tool_names: Sequence[str],
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> List[str]:
        """
        Apply interaction-mode allowlist and dev selection to tool name list.

        Preserves input ordering.
        """
        filtered = list(tool_names)
        allowlist = self._get_interaction_allowlist()
        if allowlist is not None:
            filtered = [name for name in filtered if name in allowlist]

        effective_selection = self._resolve_selection(selection)
        if effective_selection is not None:
            filtered = effective_selection.filter_tool_names(filtered)

        allowed_mouse_methods = self._get_model_allowed_mouse_coordinate_methods(
            effective_selection
        )
        if "mouse_control" in filtered and not allowed_mouse_methods:
            filtered = [name for name in filtered if name != "mouse_control"]
        return filtered

    def filter_tool_schemas(
        self,
        tool_schemas: Sequence[Dict[str, Any]],
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> List[Dict[str, Any]]:
        """
        Apply interaction-mode allowlist and dev selection to tool schemas.
        """
        filtered = list(tool_schemas)
        allowlist = self._get_interaction_allowlist()
        if allowlist is not None:
            filtered = [
                schema
                for schema in filtered
                if self._extract_tool_name(schema) in allowlist
            ]

        effective_selection = self._resolve_selection(selection)
        if effective_selection is not None:
            filtered = effective_selection.filter_tool_schemas(filtered)

        return self._apply_model_mouse_schema_contract(
            filtered,
            selection=effective_selection,
        )

    def get_method_validation_errors(
        self,
        tool_name: str,
        args: Dict[str, Any],
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> List[str]:
        """
        Return method-level validation errors for specific tools.

        Currently only enforces dev policy for mouse_control.find_coordinates_by.
        """
        if tool_name != "mouse_control":
            return []

        effective_selection = self._resolve_selection(selection)
        allowed_methods = self._get_model_allowed_mouse_coordinate_methods(
            effective_selection
        )
        if not allowed_methods:
            return [
                "Tool name 'mouse_control' is disabled by policy (no coordinate methods enabled)"
            ]

        raw_method = args.get("find_coordinates_by")
        normalized_method = normalize_coordinate_method(raw_method, default="manual")
        if normalized_method in allowed_methods:
            return []

        allowed_display = ", ".join(
            method_name
            for method_name in _MOUSE_COORD_METHODS
            if method_name in allowed_methods
        )
        return [
            f"mouse_control.find_coordinates_by='{raw_method}' is disabled by policy. "
            f"Allowed methods: {allowed_display or 'none'}"
        ]

    def should_initialize_ocr(
        self,
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> bool:
        """Whether OCR startup initialization should run."""
        effective_selection = self._resolve_selection(selection)
        return "ocr" in self._get_model_allowed_mouse_coordinate_methods(
            effective_selection
        )

    def should_initialize_vision(
        self,
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> bool:
        """Whether vision startup initialization should run."""
        effective_selection = self._resolve_selection(selection)
        return "prediction" in self._get_model_allowed_mouse_coordinate_methods(
            effective_selection
        )

    def _resolve_selection(
        self,
        selection: Optional[ToolSelection] | object,
    ) -> Optional[ToolSelection]:
        if selection is _UNSET:
            return self.selection
        return selection

    def _get_interaction_allowlist(self) -> Optional[set[str]]:
        """Return interaction-mode allowlist (if configured)."""
        try:
            allowlist = self.config.get_tool_allowlist()
        except Exception:
            return None
        if allowlist is None:
            return None
        if isinstance(allowlist, set):
            return allowlist
        if isinstance(allowlist, (list, tuple)):
            return {
                name
                for name in allowlist
                if isinstance(name, str)
            }
        return None

    @staticmethod
    def _extract_tool_name(schema: Dict[str, Any]) -> Optional[str]:
        """Extract canonical tool name from OpenAI/LiteLLM tool object."""
        function_schema = schema.get("function")
        if not isinstance(function_schema, dict):
            return None
        tool_name = function_schema.get("name")
        return tool_name if isinstance(tool_name, str) else None

    @staticmethod
    def _get_mouse_args_properties(schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        function_schema = schema.get("function")
        if not isinstance(function_schema, dict):
            return None
        parameters = function_schema.get("parameters")
        if not isinstance(parameters, dict):
            return None
        properties = parameters.get("properties")
        if isinstance(properties, dict):
            return properties
        return None

    @staticmethod
    def _filter_mouse_schema_methods(
        schema: Dict[str, Any],
        allowed_methods: frozenset[str],
    ) -> Optional[Dict[str, Any]]:
        if not allowed_methods:
            return None

        schema_copy = copy.deepcopy(schema)
        args_props = ToolPolicy._get_mouse_args_properties(schema_copy)
        if args_props is None:
            return schema_copy

        ordered_methods = [
            method for method in _MOUSE_COORD_METHODS if method in allowed_methods
        ]
        method_schema = args_props.get("find_coordinates_by")
        if isinstance(method_schema, dict):
            method_schema["type"] = "string"
            method_schema["enum"] = ordered_methods
            default_method = method_schema.get("default")
            if default_method not in allowed_methods:
                if ordered_methods:
                    method_schema["default"] = ordered_methods[0]
                else:
                    method_schema.pop("default", None)

        if "manual" not in allowed_methods:
            args_props.pop("x", None)
            args_props.pop("y", None)
        if "ocr" not in allowed_methods:
            args_props.pop("ocr_text", None)
            args_props.pop("candidate_id", None)
            args_props.pop("screenshot_id", None)
        if "prediction" not in allowed_methods:
            args_props.pop("description", None)
            args_props.pop("model_name", None)

        return schema_copy

    def _get_model_allowed_mouse_coordinate_methods(
        self,
        selection: Optional[ToolSelection],
    ) -> frozenset[str]:
        allowed_methods = set(_MODEL_MOUSE_COORD_METHODS)
        if selection is not None:
            selection_methods = selection.get_allowed_mouse_coordinate_methods()
            allowed_methods &= set(selection_methods)
        return frozenset(allowed_methods)

    def _apply_model_mouse_schema_contract(
        self,
        tool_schemas: Sequence[Dict[str, Any]],
        *,
        selection: Optional[ToolSelection],
    ) -> List[Dict[str, Any]]:
        allowed_methods = self._get_model_allowed_mouse_coordinate_methods(selection)
        filtered: List[Dict[str, Any]] = []
        for schema in tool_schemas:
            tool_name = self._extract_tool_name(schema)
            if tool_name != "mouse_control":
                filtered.append(schema)
                continue
            filtered_mouse = self._filter_mouse_schema_methods(schema, allowed_methods)
            if filtered_mouse is not None:
                filtered.append(filtered_mouse)
        return filtered
