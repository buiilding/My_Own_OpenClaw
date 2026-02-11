"""
Tool policy service.

Centralizes decisions for:
- Tool visibility (interaction mode allowlist + dev selection)
- Tool schema filtering for prompt injection
- Mouse coordinate-method validation (manual/ocr/prediction)
- Startup gating for optional OCR and vision initialization
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any, Dict, List, Optional, Sequence

from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.tools.tool_selection import ToolSelection, load_tool_selection

logger = logging.getLogger(__name__)

_UNSET = object()


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
                if schema.get("name") in allowlist
            ]

        effective_selection = self._resolve_selection(selection)
        if effective_selection is not None:
            filtered = effective_selection.filter_tool_schemas(filtered)
        return filtered

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
        if effective_selection is None:
            return []

        allowed_methods = effective_selection.get_allowed_mouse_coordinate_methods()
        if not allowed_methods:
            return [
                "Tool name 'mouse_control' is disabled by dev tool selection (no coordinate methods enabled)"
            ]

        raw_method = args.get(
            "find_coordinates_by",
            CoordinateFindingMethod.MANUAL.value,
        )
        normalized_method = self._normalize_coordinate_method(raw_method)
        if normalized_method in allowed_methods:
            return []

        allowed_display = ", ".join(
            method_name
            for method_name in ("manual", "ocr", "prediction")
            if method_name in allowed_methods
        )
        return [
            f"mouse_control.find_coordinates_by='{raw_method}' is disabled by dev tool selection. "
            f"Allowed methods: {allowed_display or 'none'}"
        ]

    def should_initialize_ocr(
        self,
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> bool:
        """Whether OCR startup initialization should run."""
        effective_selection = self._resolve_selection(selection)
        if effective_selection is None:
            return True
        return "ocr" in effective_selection.get_allowed_mouse_coordinate_methods()

    def should_initialize_vision(
        self,
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> bool:
        """Whether vision startup initialization should run."""
        effective_selection = self._resolve_selection(selection)
        if effective_selection is None:
            return True
        return "prediction" in effective_selection.get_allowed_mouse_coordinate_methods()

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
    def _normalize_coordinate_method(value: Any) -> str:
        """Normalize enum/string coordinate method value to lowercase string."""
        if isinstance(value, CoordinateFindingMethod):
            return value.value
        if isinstance(value, str):
            return value.strip().lower()
        return str(value).strip().lower()
