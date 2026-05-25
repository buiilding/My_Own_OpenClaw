"""
Dev Tool Selection.

This module provides a lightweight, dev-oriented mechanism to filter which tool
schemas are injected into the LLM prompt (and which tool calls are accepted).

Configuration file (default):
  backend/dev/tool_selection.toml

Override path via env var:
  WINDIEOS_DEV_TOOL_SELECTION_PATH=/abs/path/to/tool_selection.toml
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
import hashlib
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import tomllib

from backend.src.tools.tool_specs import get_tool_spec_name

logger = logging.getLogger(__name__)

_ENV_PATH = "WINDIEOS_DEV_TOOL_SELECTION_PATH"
_MOUSE_COORD_METHODS: tuple[str, ...] = ("manual", "ocr", "prediction")
_SOURCE_GROUNDED_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "mouse_control",
        "scroll_control",
        "grounded_mouse_action",
        "grounded_scroll_action",
    }
)
_DRAG_DESTINATION_GROUNDED_TOOL_NAMES: frozenset[str] = frozenset(
    {"mouse_control", "grounded_mouse_action"}
)
_NON_MANUAL_GROUNDED_TOOL_NAMES: frozenset[str] = frozenset(
    {"grounded_mouse_action", "grounded_scroll_action"}
)
_DERIVED_TOOL_PARENT_NAMES: dict[str, str] = {
    "grounded_mouse_action": "mouse_control",
    "grounded_scroll_action": "scroll_control",
}


def _ordered_mouse_methods(methods: Sequence[str]) -> List[str]:
    return [method for method in _MOUSE_COORD_METHODS if method in methods]


def _default_selection_path() -> Path:
    # WindieOS/backend/src/tools/tool_selection.py -> parents[2] == WindieOS/backend
    return Path(__file__).resolve().parents[2] / "dev" / "tool_selection.toml"


@dataclass(frozen=True, slots=True)
class ToolSelection:
    enabled: bool
    mode: str  # "allowlist" | "denylist"
    tools: frozenset[str]
    mouse_enabled_coordinate_methods: Optional[frozenset[str]] = None

    def is_tool_enabled(self, tool_name: str) -> bool:
        """Return True if the tool is enabled by top-level allow/deny policy."""
        parent_tool_name = _DERIVED_TOOL_PARENT_NAMES.get(tool_name, tool_name)
        if not self.enabled:
            return True
        if self.mode == "allowlist":
            return self._is_allowlisted(parent_tool_name)
        return self._is_not_denylisted(parent_tool_name)

    def get_allowed_mouse_coordinate_methods(self) -> frozenset[str]:
        """
        Return allowed mouse coordinate methods after top-level tool filtering.

        Notes:
        - If mouse_control is disabled, this returns an empty set.
        - If enabled and method list is unspecified, all methods are allowed.
        """
        if not self.is_tool_enabled("mouse_control"):
            return frozenset()
        if self.mouse_enabled_coordinate_methods is None:
            return frozenset(_MOUSE_COORD_METHODS)
        return self.mouse_enabled_coordinate_methods

    def _is_mouse_control_effectively_enabled(self) -> bool:
        return bool(self.get_allowed_mouse_coordinate_methods())

    def filter_tool_names(
        self,
        tool_names: Sequence[str],
        *,
        normalize_wrappers: bool = True,
    ) -> List[str]:
        """Filter tool names according to selection mode (stable order)."""
        _ = normalize_wrappers
        if not self.enabled:
            return [
                name
                for name in tool_names
                if isinstance(name, str)
            ]
        filtered: List[str] = []
        for name in tool_names:
            if not isinstance(name, str):
                continue
            if not self.is_tool_enabled(name):
                continue
            if name == "mouse_control" and not self._is_mouse_control_effectively_enabled():
                continue
            if name in _NON_MANUAL_GROUNDED_TOOL_NAMES and not self._has_non_manual_methods(
                self.get_allowed_mouse_coordinate_methods()
            ):
                continue
            filtered.append(name)
        return filtered

    def filter_tool_schemas(self, tool_schemas: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter canonical tool objects by nested function.name."""
        if not self.enabled:
            return list(tool_schemas)

        filtered: List[Dict[str, Any]] = []
        allowed_methods = self.get_allowed_mouse_coordinate_methods()
        for schema in tool_schemas:
            tool_name = self._get_tool_name(schema)
            if not isinstance(tool_name, str):
                # Keep non-standard schema entries unless explicitly in allowlist mode.
                if self.mode != "allowlist":
                    filtered.append(schema)
                continue

            if not self.is_tool_enabled(tool_name):
                continue

            if tool_name in _SOURCE_GROUNDED_TOOL_NAMES:
                filtered_schema = self._filter_grounded_tool_schema(
                    schema,
                    tool_name=tool_name,
                    allowed_methods=allowed_methods,
                )
                if filtered_schema is not None:
                    filtered.append(filtered_schema)
                continue

            filtered.append(schema)

        return filtered

    def _filter_grounded_tool_schema(
        self,
        schema: Dict[str, Any],
        *,
        tool_name: str,
        allowed_methods: frozenset[str],
    ) -> Optional[Dict[str, Any]]:
        """
        Filter grounded desktop-tool schemas by allowed coordinate methods.

        This prunes:
        - coordinate-method enums/defaults
        - method-specific source and drag-destination fields
        - conditional JSON-schema branches for disabled methods
        """
        if tool_name == "mouse_control" and not allowed_methods:
            return None
        if tool_name in _NON_MANUAL_GROUNDED_TOOL_NAMES and not self._has_non_manual_methods(
            allowed_methods
        ):
            return None

        schema_copy = copy.deepcopy(schema)
        parameters = self._get_schema_parameters(schema_copy)
        args_props = self._get_schema_properties(schema_copy)
        if parameters is None or args_props is None:
            return schema_copy

        if tool_name in _SOURCE_GROUNDED_TOOL_NAMES:
            self._filter_source_grounding_schema(
                args_props,
                allowed_methods=allowed_methods,
            )
            self._filter_conditional_rules(
                parameters,
                method_field_name="find_coordinates_by",
                allowed_methods=allowed_methods,
            )

        if tool_name in _DRAG_DESTINATION_GROUNDED_TOOL_NAMES:
            self._filter_drag_destination_schema(
                args_props,
                allowed_methods=allowed_methods,
            )
            self._filter_conditional_rules(
                parameters,
                method_field_name="drag_to_find_coordinates_by",
                allowed_methods=allowed_methods,
            )
        return schema_copy

    @staticmethod
    def _get_schema_parameters(schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        parameters = schema.get("parameters")
        return parameters if isinstance(parameters, dict) else None

    @classmethod
    def _get_schema_properties(cls, schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Navigate to canonical function-tool parameters.properties."""
        parameters = cls._get_schema_parameters(schema)
        if parameters is None:
            return None
        properties = parameters.get("properties")
        return properties if isinstance(properties, dict) else None

    @classmethod
    def _filter_source_grounding_schema(
        cls,
        args_props: Dict[str, Any],
        *,
        allowed_methods: frozenset[str],
    ) -> None:
        ordered_methods = _ordered_mouse_methods(tuple(allowed_methods))
        cls._rewrite_method_property(
            args_props.get("find_coordinates_by"),
            ordered_methods=ordered_methods,
        )

        if "manual" not in allowed_methods:
            args_props.pop("x", None)
            args_props.pop("y", None)
        if "ocr" not in allowed_methods:
            args_props.pop("ocr_text", None)
            args_props.pop("candidate_id", None)
        if "prediction" not in allowed_methods:
            args_props.pop("source_description", None)
            args_props.pop("model_name", None)

    @classmethod
    def _filter_drag_destination_schema(
        cls,
        args_props: Dict[str, Any],
        *,
        allowed_methods: frozenset[str],
    ) -> None:
        ordered_methods = _ordered_mouse_methods(tuple(allowed_methods))
        cls._rewrite_method_property(
            args_props.get("drag_to_find_coordinates_by"),
            ordered_methods=ordered_methods,
        )

        if "manual" not in allowed_methods:
            args_props.pop("drag_to_x", None)
            args_props.pop("drag_to_y", None)
        if "ocr" not in allowed_methods:
            args_props.pop("drag_to_ocr_text", None)
            args_props.pop("drag_to_candidate_id", None)
        if "prediction" not in allowed_methods:
            args_props.pop("destination_description", None)
            args_props.pop("drag_to_model_name", None)

    @staticmethod
    def _rewrite_method_property(
        method_schema: Any,
        *,
        ordered_methods: List[str],
    ) -> None:
        if not isinstance(method_schema, dict):
            return
        method_schema["type"] = "string"
        method_schema["enum"] = ordered_methods
        default_method = method_schema.get("default")
        if default_method not in ordered_methods:
            if ordered_methods:
                method_schema["default"] = ordered_methods[0]
            else:
                method_schema.pop("default", None)

    @classmethod
    def _filter_conditional_rules(
        cls,
        parameters: Dict[str, Any],
        *,
        method_field_name: str,
        allowed_methods: frozenset[str],
    ) -> None:
        all_of = parameters.get("allOf")
        if not isinstance(all_of, list):
            return

        filtered_rules: List[Any] = []
        for rule in all_of:
            method_name = cls._extract_rule_method_name(rule, method_field_name)
            if method_name is None or method_name in allowed_methods:
                filtered_rules.append(rule)

        if filtered_rules:
            parameters["allOf"] = filtered_rules
        else:
            parameters.pop("allOf", None)

    @staticmethod
    def _extract_rule_method_name(
        rule: Any,
        method_field_name: str,
    ) -> Optional[str]:
        if not isinstance(rule, dict):
            return None
        method_name = ToolSelection._find_rule_method_name(
            rule.get("if"),
            method_field_name,
        )
        return method_name if isinstance(method_name, str) else None

    @staticmethod
    def _find_rule_method_name(
        node: Any,
        method_field_name: str,
    ) -> Optional[str]:
        if isinstance(node, dict):
            properties = node.get("properties")
            if isinstance(properties, dict):
                method_schema = properties.get(method_field_name)
                if isinstance(method_schema, dict):
                    method_name = method_schema.get("const")
                    if isinstance(method_name, str):
                        return method_name
            for key in ("allOf", "anyOf", "oneOf"):
                children = node.get(key)
                if isinstance(children, list):
                    for child in children:
                        method_name = ToolSelection._find_rule_method_name(
                            child,
                            method_field_name,
                        )
                        if method_name is not None:
                            return method_name
        return None

    @staticmethod
    def _has_non_manual_methods(allowed_methods: frozenset[str]) -> bool:
        return any(method in allowed_methods for method in ("ocr", "prediction"))

    def _is_allowlisted(self, tool_name: str) -> bool:
        return tool_name in self.tools

    def _is_not_denylisted(self, tool_name: str) -> bool:
        if tool_name in self.tools:
            return False
        return True

    @staticmethod
    def _normalize_tool_name(tool_name: str) -> str:
        return tool_name

    @staticmethod
    def _get_tool_name(schema: Dict[str, Any]) -> Optional[str]:
        return get_tool_spec_name(schema)


_CACHE: dict[Path, tuple[tuple[int, int, int], str, Optional[ToolSelection]]] = {}


def _cache_stat_signature(stat_result: os.stat_result) -> tuple[int, int, int]:
    """
    Return a file-change signature robust against same-mtime rewrites.

    We intentionally include ctime and size in addition to mtime so cache
    invalidation still works when a file is rewritten and its mtime is
    preserved (for example, via explicit utime calls in tooling/scripts).
    """
    return (stat_result.st_mtime_ns, stat_result.st_ctime_ns, stat_result.st_size)


def _cache_content_signature(raw_bytes: bytes) -> str:
    """Return a stable content fingerprint for same-size/same-mtime rewrites."""
    return hashlib.blake2b(raw_bytes, digest_size=16).hexdigest()


def _parse_selection(data: Dict[str, Any]) -> Optional[ToolSelection]:
    enabled = bool(data.get("enabled", False))
    if not enabled:
        return None

    mode_raw = data.get("mode", "denylist")
    mode = str(mode_raw).strip().lower()
    if mode not in {"allowlist", "denylist"}:
        logger.warning("Invalid tool selection mode=%r (expected allowlist|denylist). Using denylist.", mode_raw)
        mode = "denylist"

    tools_raw = data.get("tools", [])
    tools: set[str] = set()
    if isinstance(tools_raw, (list, tuple, set)):
        for item in tools_raw:
            if isinstance(item, str) and item.strip():
                tools.add(item.strip())
            elif item is not None:
                logger.debug("Ignoring non-string tool selection entry: %r", item)
    elif tools_raw is not None:
        logger.warning("Invalid tool selection tools=%r (expected array). Ignoring.", tools_raw)

    mouse_methods: Optional[frozenset[str]] = None
    tool_options = data.get("tool_options", {})
    if isinstance(tool_options, dict):
        mouse_cfg = tool_options.get("mouse_control", {})
        if isinstance(mouse_cfg, dict) and "enabled_coordinate_methods" in mouse_cfg:
            methods_raw = mouse_cfg.get("enabled_coordinate_methods")
            parsed_methods: set[str] = set()
            if isinstance(methods_raw, (list, tuple, set)):
                for item in methods_raw:
                    if not isinstance(item, str):
                        logger.debug("Ignoring non-string mouse enabled_coordinate_methods entry: %r", item)
                        continue
                    normalized = item.strip().lower()
                    if normalized in _MOUSE_COORD_METHODS:
                        parsed_methods.add(normalized)
                    elif normalized:
                        logger.warning(
                            "Ignoring unknown mouse coordinate method '%s' (valid: %s)",
                            normalized,
                            ", ".join(_MOUSE_COORD_METHODS),
                        )
            else:
                logger.warning(
                    "Invalid mouse enabled_coordinate_methods=%r (expected array). Ignoring.",
                    methods_raw,
                )
            mouse_methods = frozenset(parsed_methods)
    elif tool_options is not None:
        logger.warning("Invalid tool_options=%r (expected table/object). Ignoring.", tool_options)

    return ToolSelection(
        enabled=True,
        mode=mode,
        tools=frozenset(tools),
        mouse_enabled_coordinate_methods=mouse_methods,
    )


def load_tool_selection(path: Optional[Path] = None) -> Optional[ToolSelection]:
    """
    Load tool selection config from TOML.

    Returns:
        ToolSelection if enabled; otherwise None.
    """
    if path is None:
        env_path = os.getenv(_ENV_PATH)
        path = Path(env_path).expanduser() if env_path else _default_selection_path()

    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    except Exception as e:
        logger.warning("Failed to stat tool selection file %s: %s", path, e)
        return None

    cached = _CACHE.get(path)
    stat_signature = _cache_stat_signature(stat)

    selection: Optional[ToolSelection] = None
    content_signature = ""
    try:
        raw_bytes = path.read_bytes()
        content_signature = _cache_content_signature(raw_bytes)
        if cached and cached[0] == stat_signature and cached[1] == content_signature:
            return cached[2]
        data = tomllib.loads(raw_bytes.decode("utf-8"))
        if isinstance(data, dict):
            selection = _parse_selection(data)
        else:
            logger.warning("Tool selection file %s did not parse to a dict. Ignoring.", path)
            selection = None
    except Exception as e:
        logger.warning("Failed to load tool selection file %s: %s", path, e)
        selection = None

    _CACHE[path] = (stat_signature, content_signature, selection)
    if selection is not None and selection.mode == "allowlist" and not selection.tools:
        logger.warning("Tool selection enabled with allowlist mode but no tools configured (0 tools allowed).")
    return selection


def should_initialize_ocr(path: Optional[Path] = None) -> bool:
    """Return whether OCR service should initialize at backend startup."""
    selection = load_tool_selection(path)
    if selection is None:
        return True
    return "ocr" in selection.get_allowed_mouse_coordinate_methods()


def should_initialize_vision(path: Optional[Path] = None) -> bool:
    """Return whether vision service should initialize at backend startup."""
    selection = load_tool_selection(path)
    if selection is None:
        return True
    return "prediction" in selection.get_allowed_mouse_coordinate_methods()
