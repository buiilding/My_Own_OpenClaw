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

from backend.src.core.utils.coordinate_methods import normalize_coordinate_method
from backend.src.tools.tool_selection import ToolSelection, load_tool_selection
from backend.src.tools.tool_specs import get_tool_spec_name
from backend.src.tools.web_search.capabilities import should_expose_backend_web_search_tool

logger = logging.getLogger(__name__)

_UNSET = object()


@dataclass(slots=True)
class ToolPolicy:
    """Central policy evaluator for tool exposure and method-level constraints."""

    config: Any
    selection: Optional[ToolSelection]

    @classmethod
    def from_config(cls, config: Any) -> "ToolPolicy":
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
        *,
        normalize_wrappers: bool = True,
    ) -> List[str]:
        _ = normalize_wrappers
        filtered = [name for name in tool_names if isinstance(name, str)]
        filtered = self._filter_web_search_names(filtered)
        disabled_tools = self._get_config_disabled_tools()
        if disabled_tools:
            filtered = [name for name in filtered if name not in disabled_tools]
        allowlist = self._get_interaction_allowlist()
        if allowlist is not None:
            filtered = [name for name in filtered if name in allowlist]

        effective_selection = self._resolve_selection(selection)
        if effective_selection is not None:
            filtered = effective_selection.filter_tool_names(filtered, normalize_wrappers=False)
        return filtered

    def filter_tool_schemas(
        self,
        tool_schemas: Sequence[Dict[str, Any]],
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> List[Dict[str, Any]]:
        filtered = list(tool_schemas)
        filtered = self._filter_web_search_schemas(filtered)
        disabled_tools = self._get_config_disabled_tools()
        if disabled_tools:
            filtered = [
                schema
                for schema in filtered
                if self._extract_tool_name(schema) not in disabled_tools
            ]
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
        return filtered

    def get_method_validation_errors(
        self,
        tool_name: str,
        args: Dict[str, Any],
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> List[str]:
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

        raw_method = args.get("find_coordinates_by")
        normalized_method = normalize_coordinate_method(raw_method, default="manual")
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
        effective_selection = self._resolve_selection(selection)
        if effective_selection is None:
            return True
        return "ocr" in effective_selection.get_allowed_mouse_coordinate_methods()

    def should_initialize_vision(
        self,
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> bool:
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

    def _get_config_disabled_tools(self) -> set[str]:
        disabled: set[str] = set()
        browser_enabled = self._get_config_value(
            "browser_automation_enabled",
            default=False,
        )
        if browser_enabled is not True:
            disabled.add("browser")
        return disabled

    def _get_interaction_allowlist(self) -> Optional[set[str]]:
        try:
            get_tool_allowlist = getattr(self.config, "get_tool_allowlist", None)
            if callable(get_tool_allowlist):
                allowlist = get_tool_allowlist()
            else:
                allowlist = None
        except Exception:
            return None
        if allowlist is None:
            return None
        if isinstance(allowlist, (set, list, tuple)):
            return {name for name in allowlist if isinstance(name, str)}
        return None

    def _get_config_value(self, key: str, *, default: Any = None) -> Any:
        if isinstance(self.config, dict):
            return self.config.get(key, default)
        return getattr(self.config, key, default)

    def _filter_web_search_names(self, tool_names: Sequence[str]) -> List[str]:
        if should_expose_backend_web_search_tool(self.config):
            return list(tool_names)
        return [tool_name for tool_name in tool_names if tool_name != "web_search"]

    def _filter_web_search_schemas(
        self,
        tool_schemas: Sequence[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        if should_expose_backend_web_search_tool(self.config):
            return list(tool_schemas)
        return [
            schema
            for schema in tool_schemas
            if self._extract_tool_name(schema) != "web_search"
        ]

    @staticmethod
    def _extract_tool_name(schema: Dict[str, Any]) -> Optional[str]:
        return get_tool_spec_name(schema)
