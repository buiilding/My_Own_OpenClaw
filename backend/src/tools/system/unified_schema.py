"""Canonical unified system/filesystem function declaration schema."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping, Sequence

from backend.src.tools.remote_tools.computer import RemoteGetOpenWindowsTool
from backend.src.tools.remote_tools.filesystem import RemoteReadFileTool, RemoteReplaceTool
from backend.src.tools.remote_tools.system import RemoteGetSystemStatsTool, RemoteShellTool
from backend.src.tools.tool_catalog import get_wrapper_member_names

_SYSTEM_TOOL_CLASSES = {
    "run_shell_command": RemoteShellTool,
    "replace": RemoteReplaceTool,
    "read_file": RemoteReadFileTool,
    "get_system_stats": RemoteGetSystemStatsTool,
    "get_open_windows": RemoteGetOpenWindowsTool,
}
_SYSTEM_TOOL_ORDER = get_wrapper_member_names("system_use")


def _extract_parameters(function_declaration: Mapping[str, Any]) -> dict[str, Any]:
    function_schema = function_declaration.get("function", {})
    parameters = function_schema.get("parameters", {})
    return deepcopy(parameters) if isinstance(parameters, dict) else {"type": "object"}


def _get_concrete_declaration(tool_name: str) -> dict[str, Any]:
    return _SYSTEM_TOOL_CLASSES[tool_name]().get_json_schema()


def _build_variant(
    tool_name: str,
    concrete_declarations: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    schema = concrete_declarations.get(tool_name)
    if not isinstance(schema, Mapping):
        schema = _get_concrete_declaration(tool_name)
    variant = _extract_parameters(schema)
    properties = variant.get("properties")
    if isinstance(properties, dict):
        properties = deepcopy(properties)
        properties.pop("explanation", None)
        variant["properties"] = properties

    required = variant.get("required")
    if isinstance(required, list):
        variant["required"] = [
            field_name
            for field_name in required
            if field_name != "explanation"
        ]

    variant["title"] = f"{tool_name} arguments"
    return variant


def get_unified_system_use_function_declaration(
    *,
    included_tool_names: Sequence[str] | None = None,
    concrete_declarations: Mapping[str, Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return the canonical unified system/filesystem function declaration schema."""
    requested_names = included_tool_names or _SYSTEM_TOOL_ORDER
    concrete_schemas = concrete_declarations or {}
    ordered_tool_names = [
        tool_name
        for tool_name in _SYSTEM_TOOL_ORDER
        if tool_name in requested_names
    ]
    variants = [
        _build_variant(tool_name, concrete_schemas)
        for tool_name in ordered_tool_names
    ]

    return {
        "type": "function",
        "function": {
            "name": "system_use",
            "description": (
                "Unified system/filesystem tool.\n\n"
                "Choose an action with `tool`, provide top-level rationale in `explanation`, "
                "and pass action-specific fields in `arguments`."
            ),
            "parameters": {
                "type": "object",
                "description": "Envelope for unified system/filesystem calls.",
                "additionalProperties": False,
                "required": ["tool", "explanation"],
                "properties": {
                    "tool": {
                        "type": "string",
                        "description": "System/filesystem action name.",
                        "enum": ordered_tool_names,
                    },
                    "explanation": {
                        "type": "string",
                        "description": "Why this action is needed.",
                        "minLength": 1,
                    },
                    "arguments": {
                        "type": "object",
                        "description": "Arguments for the selected `tool` action.",
                        "oneOf": variants,
                    },
                },
            },
        },
    }
