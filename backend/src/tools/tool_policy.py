"""
Tool policy service.

Centralizes decisions for:
- Tool visibility (interaction mode allowlist + dev selection)
- Tool schema filtering for prompt injection
- Mouse coordinate-method validation (manual/ocr/prediction)
- Startup gating for optional OCR and vision initialization
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from backend.src.core.utils.coordinate_methods import normalize_coordinate_method
from backend.src.tools.agent_capability_policy import (
    build_agent_tool_selection,
    disabled_tools_from_config,
)
from backend.src.tools.tool_selection import ToolSelection, load_tool_selection
from backend.src.tools.tool_specs import get_tool_spec_name
from backend.src.tools.web_search.capabilities import (
    should_expose_backend_web_search_tool,
)

logger = logging.getLogger(__name__)

_UNSET = object()


@dataclass(slots=True)
class ToolPolicy:
    """Central policy evaluator for tool exposure and method-level constraints."""

    config: Any
    agent_selection: Optional[ToolSelection] = None
    selection: Optional[ToolSelection] = None

    @classmethod
    def from_config(cls, config: Any) -> "ToolPolicy":
        agent_selection = build_agent_tool_selection(config)
        selection: Optional[ToolSelection]
        try:
            selection = load_tool_selection()
        except Exception:
            logger.debug(
                "Failed to load dev tool selection; continuing without it.",
                exc_info=True,
            )
            selection = None
        return cls(
            config=config,
            agent_selection=agent_selection,
            selection=selection,
        )

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

        if self.agent_selection is not None:
            filtered = self.agent_selection.filter_tool_names(
                filtered,
                normalize_wrappers=False,
            )

        effective_selection = self._resolve_selection(selection)
        if effective_selection is not None:
            filtered = effective_selection.filter_tool_names(
                filtered, normalize_wrappers=False
            )
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

        if self.agent_selection is not None:
            filtered = self.agent_selection.filter_tool_schemas(filtered)

        effective_selection = self._resolve_selection(selection)
        if effective_selection is not None:
            filtered = effective_selection.filter_tool_schemas(filtered)
        return filtered

    def filter_projected_tool_schemas(
        self,
        tool_schemas: Sequence[Dict[str, Any]],
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> List[Dict[str, Any]]:
        """
        Apply selection-only pruning after provider projection.

        Provider projection can add non-function tools such as OpenAI's native
        `computer` declaration plus grounded helper schemas. Preserve non-function
        tool declarations, but still prune grounded function schemas so disabled
        OCR/prediction fields do not leak into the model-facing surface.
        """
        selections = [
            policy_selection
            for policy_selection in (
                self.agent_selection,
                self._resolve_selection(selection),
            )
            if policy_selection is not None
        ]
        if not selections:
            return list(tool_schemas)

        filtered: List[Dict[str, Any]] = []
        for schema in tool_schemas:
            if not isinstance(schema, dict):
                continue
            tool_name = self._extract_tool_name(schema)
            if not isinstance(tool_name, str):
                filtered.append(schema)
                continue
            schema_candidates = [schema]
            for policy_selection in selections:
                schema_candidates = policy_selection.filter_tool_schemas(
                    schema_candidates
                )
                if not schema_candidates:
                    break
            filtered.extend(schema_candidates)
        return filtered

    def get_method_validation_errors(
        self,
        tool_name: str,
        args: Dict[str, Any],
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> List[str]:
        if tool_name != "mouse_control":
            return []

        errors: List[str] = []
        selections = [
            ("agent capability policy", self.agent_selection),
            ("dev tool selection", self._resolve_selection(selection)),
        ]
        for label, effective_selection in selections:
            if effective_selection is None:
                continue
            errors.extend(
                self._get_method_validation_errors_for_selection(
                    tool_name,
                    args,
                    effective_selection,
                    policy_label=label,
                )
            )
        return errors

    def _get_method_validation_errors_for_selection(
        self,
        tool_name: str,
        args: Dict[str, Any],
        selection: ToolSelection,
        *,
        policy_label: str,
    ) -> List[str]:
        _ = tool_name
        allowed_methods = selection.get_allowed_mouse_coordinate_methods()
        if not allowed_methods:
            return [
                f"Tool name 'mouse_control' is disabled by {policy_label} "
                "(no coordinate methods enabled)"
            ]

        allowed_display = ", ".join(
            method_name
            for method_name in ("manual", "ocr", "prediction")
            if method_name in allowed_methods
        )
        errors: List[str] = []
        for field_name in ("find_coordinates_by", "drag_to_find_coordinates_by"):
            if field_name == "drag_to_find_coordinates_by" and field_name not in args:
                continue
            raw_method = args.get(field_name)
            normalized_method = normalize_coordinate_method(
                raw_method, default="manual"
            )
            if normalized_method in allowed_methods:
                continue
            errors.append(
                f"mouse_control.{field_name}='{raw_method}' is disabled by {policy_label}. "
                f"Allowed methods: {allowed_display or 'none'}"
            )
        return errors

    def get_allowed_mouse_coordinate_methods(
        self,
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> frozenset[str]:
        allowed_methods = frozenset(("manual", "ocr", "prediction"))
        for effective_selection in (
            self.agent_selection,
            self._resolve_selection(selection),
        ):
            if effective_selection is None:
                continue
            allowed_methods = allowed_methods.intersection(
                effective_selection.get_allowed_mouse_coordinate_methods()
            )
        return frozenset(
            method
            for method in ("manual", "ocr", "prediction")
            if method in allowed_methods
        )

    def should_initialize_ocr(
        self,
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> bool:
        effective_selection = self._resolve_selection(selection)
        return "ocr" in self.get_allowed_mouse_coordinate_methods(effective_selection)

    def should_initialize_vision(
        self,
        selection: Optional[ToolSelection] | object = _UNSET,
    ) -> bool:
        effective_selection = self._resolve_selection(selection)
        return "prediction" in self.get_allowed_mouse_coordinate_methods(
            effective_selection
        )

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
        disabled.update(disabled_tools_from_config(self.config))
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
