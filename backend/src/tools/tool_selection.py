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
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import tomllib

logger = logging.getLogger(__name__)

_ENV_PATH = "WINDIEOS_DEV_TOOL_SELECTION_PATH"
_MOUSE_COORD_METHODS: tuple[str, ...] = ("manual", "ocr", "prediction")


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
        if not self.enabled:
            return True
        if self.mode == "allowlist":
            return tool_name in self.tools
        return tool_name not in self.tools

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

    def filter_tool_names(self, tool_names: Sequence[str]) -> List[str]:
        """Filter tool names according to selection mode (stable order)."""
        if not self.enabled:
            return list(tool_names)
        filtered: List[str] = []
        for name in tool_names:
            if not self.is_tool_enabled(name):
                continue
            if name == "mouse_control" and not self._is_mouse_control_effectively_enabled():
                continue
            filtered.append(name)
        return filtered

    def filter_tool_schemas(self, tool_schemas: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter tool schema dicts (expects each schema to have a 'name')."""
        if not self.enabled:
            return list(tool_schemas)

        filtered: List[Dict[str, Any]] = []
        for schema in tool_schemas:
            tool_name = schema.get("name")
            if not isinstance(tool_name, str):
                # Keep non-standard schema entries unless explicitly in allowlist mode.
                if self.mode != "allowlist":
                    filtered.append(schema)
                continue

            if not self.is_tool_enabled(tool_name):
                continue

            if tool_name != "mouse_control":
                filtered.append(schema)
                continue

            allowed_methods = self.get_allowed_mouse_coordinate_methods()
            if not allowed_methods:
                continue
            filtered.append(self._filter_mouse_control_schema(schema, allowed_methods))

        return filtered

    def _filter_mouse_control_schema(
        self,
        schema: Dict[str, Any],
        allowed_methods: frozenset[str],
    ) -> Dict[str, Any]:
        """
        Filter mouse_control arg schema by allowed coordinate methods.

        Removes method-specific fields and narrows `find_coordinates_by` enum/default.
        """
        schema_copy = copy.deepcopy(schema)
        args_props = self._get_mouse_args_properties(schema_copy)
        if args_props is None:
            return schema_copy

        ordered_methods = _ordered_mouse_methods(tuple(allowed_methods))
        method_schema = args_props.get("find_coordinates_by")
        if isinstance(method_schema, dict):
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
        if "prediction" not in allowed_methods:
            args_props.pop("description", None)
            args_props.pop("model_name", None)

        return schema_copy

    @staticmethod
    def _get_mouse_args_properties(schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Navigate to mouse_control args.properties in wrapped or native schema."""
        try:
            # Legacy wrapped computer-use schema
            args_schema = (
                schema["parameters"]["properties"]["action"]["properties"]["functionCall"]["properties"]["args"]
            )
            properties = args_schema.get("properties")
            if isinstance(properties, dict):
                return properties
        except (KeyError, TypeError):
            pass

        try:
            # Native function-calling schema (direct args in parameters)
            params = schema["parameters"]
            properties = params.get("properties") if isinstance(params, dict) else None
            if isinstance(properties, dict):
                return properties
        except (KeyError, TypeError):
            pass

        return None


_CACHE: dict[Path, tuple[float, Optional[ToolSelection]]] = {}


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
    if cached and cached[0] == stat.st_mtime:
        return cached[1]

    selection: Optional[ToolSelection] = None
    try:
        with path.open("rb") as f:
            data = tomllib.load(f)
        if isinstance(data, dict):
            selection = _parse_selection(data)
        else:
            logger.warning("Tool selection file %s did not parse to a dict. Ignoring.", path)
            selection = None
    except Exception as e:
        logger.warning("Failed to load tool selection file %s: %s", path, e)
        selection = None

    _CACHE[path] = (stat.st_mtime, selection)
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
