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

from backend.src.tools.tool_catalog import (
    expand_model_tool_names,
    get_wrapper_member_names,
    normalize_model_tool_name,
)

logger = logging.getLogger(__name__)

_ENV_PATH = "WINDIEOS_DEV_TOOL_SELECTION_PATH"
_MOUSE_COORD_METHODS: tuple[str, ...] = ("manual", "ocr", "prediction")
_LEGACY_COMPUTER_TOOL_NAMES: frozenset[str] = frozenset(get_wrapper_member_names("computer_use"))
_UNIFIED_COMPUTER_TOOL_NAME = "computer_use"
_LEGACY_SYSTEM_TOOL_NAMES: frozenset[str] = frozenset(get_wrapper_member_names("system_use"))
_UNIFIED_SYSTEM_TOOL_NAME = "system_use"


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
        normalized_name = self._normalize_tool_name(tool_name)
        if not self.enabled:
            return True
        if self.mode == "allowlist":
            return self._is_allowlisted(normalized_name)
        return self._is_not_denylisted(normalized_name)

    def get_allowed_mouse_coordinate_methods(self) -> frozenset[str]:
        """
        Return allowed mouse coordinate methods after top-level tool filtering.

        Notes:
        - If mouse_control is disabled, this returns an empty set.
        - If enabled and method list is unspecified, all methods are allowed.
        """
        if not self.is_tool_enabled(_UNIFIED_COMPUTER_TOOL_NAME):
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
        if not self.enabled:
            if normalize_wrappers:
                return self._normalize_unified_computer_use_tool_names(tool_names)
            return [
                name
                for name in tool_names
                if isinstance(name, str)
            ]
        filtered: List[str] = []
        has_unified_computer = False
        has_unified_system = False
        for name in tool_names:
            if not isinstance(name, str):
                continue
            normalized_name = self._normalize_tool_name(name)
            if not self.is_tool_enabled(normalized_name):
                continue
            if name == "mouse_control" and not self._is_mouse_control_effectively_enabled():
                continue
            if not normalize_wrappers:
                filtered.append(name)
                continue
            if normalized_name == _UNIFIED_COMPUTER_TOOL_NAME and not self._is_mouse_control_effectively_enabled():
                continue
            if normalized_name == _UNIFIED_COMPUTER_TOOL_NAME:
                if has_unified_computer:
                    continue
                has_unified_computer = True
            if normalized_name == _UNIFIED_SYSTEM_TOOL_NAME:
                if has_unified_system:
                    continue
                has_unified_system = True
            filtered.append(normalized_name)
        return filtered

    def filter_tool_schemas(self, tool_schemas: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter canonical tool objects by nested function.name."""
        if not self.enabled:
            return list(tool_schemas)

        filtered: List[Dict[str, Any]] = []
        has_unified_computer = False
        has_unified_system = False
        for schema in tool_schemas:
            tool_name = self._get_tool_name(schema)
            if not isinstance(tool_name, str):
                # Keep non-standard schema entries unless explicitly in allowlist mode.
                if self.mode != "allowlist":
                    filtered.append(schema)
                continue

            normalized_name = self._normalize_tool_name(tool_name)
            if not self.is_tool_enabled(normalized_name):
                continue

            if normalized_name != _UNIFIED_COMPUTER_TOOL_NAME:
                if normalized_name == _UNIFIED_SYSTEM_TOOL_NAME:
                    if has_unified_system:
                        continue
                    has_unified_system = True
                filtered.append(schema)
                continue

            if has_unified_computer:
                continue
            has_unified_computer = True

            allowed_methods = self.get_allowed_mouse_coordinate_methods()
            if not allowed_methods:
                continue
            if tool_name == "mouse_control":
                filtered.append(self._filter_mouse_control_schema(schema, allowed_methods))
            elif tool_name == _UNIFIED_COMPUTER_TOOL_NAME:
                filtered.append(self._filter_computer_use_schema(schema, allowed_methods))
            else:
                filtered.append(schema)

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
            # Gemini requires enum fields to declare an explicit STRING type.
            # Our cleaned schema can drop the type due to Enum $ref flattening,
            # so enforce it at the point where we inject enum constraints.
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
        if "prediction" not in allowed_methods:
            args_props.pop("source_description", None)
            args_props.pop("destination_description", None)
            args_props.pop("drag_to_model_name", None)
            args_props.pop("model_name", None)

        return schema_copy

    def _filter_computer_use_schema(
        self,
        schema: Dict[str, Any],
        allowed_methods: frozenset[str],
    ) -> Dict[str, Any]:
        """Filter unified computer_use wrapper so mouse variant matches selection."""
        schema_copy = copy.deepcopy(schema)
        function_schema = schema_copy.get("function")
        if not isinstance(function_schema, dict):
            return schema_copy
        parameters = function_schema.get("parameters")
        if not isinstance(parameters, dict):
            return schema_copy
        properties = parameters.get("properties")
        if not isinstance(properties, dict):
            return schema_copy

        tool_schema = properties.get("tool")
        if isinstance(tool_schema, dict):
            tool_enum = tool_schema.get("enum")
            if isinstance(tool_enum, list):
                filtered_tool_enum = [
                    tool_name
                    for tool_name in tool_enum
                    if tool_name != "mouse_control" or allowed_methods
                ]
                tool_schema["enum"] = filtered_tool_enum

        arguments_schema = properties.get("arguments")
        if not isinstance(arguments_schema, dict):
            return schema_copy
        variants = arguments_schema.get("oneOf")
        if not isinstance(variants, list):
            return schema_copy

        filtered_variants: list[dict[str, Any]] = []
        for variant in variants:
            if not isinstance(variant, dict):
                filtered_variants.append(variant)
                continue
            if variant.get("title") == "mouse_control arguments":
                filtered_variants.append(
                    self._filter_unified_mouse_variant(variant, allowed_methods)
                )
                continue
            filtered_variants.append(variant)
        arguments_schema["oneOf"] = filtered_variants
        return schema_copy

    def _filter_unified_mouse_variant(
        self,
        variant: Dict[str, Any],
        allowed_methods: frozenset[str],
    ) -> Dict[str, Any]:
        variant_copy = copy.deepcopy(variant)
        properties = variant_copy.get("properties")
        if not isinstance(properties, dict):
            return variant_copy

        ordered_methods = _ordered_mouse_methods(tuple(allowed_methods))
        method_schema = properties.get("find_coordinates_by")
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
            properties.pop("x", None)
            properties.pop("y", None)
        if "ocr" not in allowed_methods:
            properties.pop("ocr_text", None)
            properties.pop("candidate_id", None)
            properties.pop("drag_to_ocr_text", None)
            properties.pop("drag_to_candidate_id", None)
        if "prediction" not in allowed_methods:
            properties.pop("source_description", None)
            properties.pop("destination_description", None)
            properties.pop("drag_to_model_name", None)
            properties.pop("model_name", None)

        return variant_copy

    @staticmethod
    def _get_mouse_args_properties(schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Navigate to mouse_control args.properties from canonical direct schema."""
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

    def _is_allowlisted(self, normalized_tool_name: str) -> bool:
        if normalized_tool_name in self.tools:
            return True
        if normalized_tool_name == _UNIFIED_COMPUTER_TOOL_NAME:
            return bool(expand_model_tool_names(self.tools) & set(_LEGACY_COMPUTER_TOOL_NAMES))
        if normalized_tool_name == _UNIFIED_SYSTEM_TOOL_NAME:
            return bool(expand_model_tool_names(self.tools) & set(_LEGACY_SYSTEM_TOOL_NAMES))
        return False

    def _is_not_denylisted(self, normalized_tool_name: str) -> bool:
        if normalized_tool_name in self.tools:
            return False
        if normalized_tool_name == _UNIFIED_COMPUTER_TOOL_NAME:
            return not bool(expand_model_tool_names(self.tools) & set(_LEGACY_COMPUTER_TOOL_NAMES))
        if normalized_tool_name == _UNIFIED_SYSTEM_TOOL_NAME:
            return not bool(expand_model_tool_names(self.tools) & set(_LEGACY_SYSTEM_TOOL_NAMES))
        return True

    @staticmethod
    def _normalize_tool_name(tool_name: str) -> str:
        return normalize_model_tool_name(tool_name)

    @classmethod
    def _normalize_unified_computer_use_tool_names(
        cls, tool_names: Sequence[str]
    ) -> List[str]:
        normalized: List[str] = []
        has_unified = False
        has_unified_system = False
        for name in tool_names:
            mapped = cls._normalize_tool_name(name)
            if mapped == _UNIFIED_COMPUTER_TOOL_NAME:
                if has_unified:
                    continue
                has_unified = True
            if mapped == _UNIFIED_SYSTEM_TOOL_NAME:
                if has_unified_system:
                    continue
                has_unified_system = True
            normalized.append(mapped)
        return normalized

    @staticmethod
    def _get_tool_name(schema: Dict[str, Any]) -> Optional[str]:
        function_schema = schema.get("function")
        if not isinstance(function_schema, dict):
            return None
        tool_name = function_schema.get("name")
        return tool_name if isinstance(tool_name, str) else None


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
