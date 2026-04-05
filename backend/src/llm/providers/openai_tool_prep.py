"""Shared OpenAI tool/schema preparation helpers used by all OpenAI transports."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional

from backend.src.tools.tool_specs import is_computer_tool_spec, is_function_tool_spec

_OPENAI_UNSUPPORTED_ROOT_SCHEMA_KEYS = ("oneOf", "anyOf", "allOf", "enum", "not")
_OPENAI_COMPATIBILITY_NOTE = (
    "Action-specific field requirements are enforced by runtime validation."
)


def _merge_openai_property_schema(
    existing: Dict[str, Any],
    incoming: Dict[str, Any],
) -> Dict[str, Any]:
    if existing == incoming:
        return deepcopy(existing)

    existing_options = existing.get("anyOf")
    incoming_options = incoming.get("anyOf")
    if isinstance(existing_options, list):
        merged_options = deepcopy(existing_options)
    else:
        merged_options = [deepcopy(existing)]

    if isinstance(incoming_options, list):
        candidate_options = [deepcopy(option) for option in incoming_options]
    else:
        candidate_options = [deepcopy(incoming)]

    for option in candidate_options:
        if option not in merged_options:
            merged_options.append(option)

    description_parts: list[str] = []
    for schema in (existing, incoming):
        description = schema.get("description")
        if isinstance(description, str) and description not in description_parts:
            description_parts.append(description)

    merged: Dict[str, Any] = {"anyOf": merged_options}
    if description_parts:
        merged["description"] = " / ".join(description_parts)
    return merged


def make_openai_parameters_compatible(parameters: Dict[str, Any]) -> Dict[str, Any]:
    compatible = deepcopy(parameters)
    root_properties = compatible.get("properties")
    if not isinstance(root_properties, dict):
        root_properties = {}
        compatible["properties"] = root_properties

    if compatible.get("type") is None:
        compatible["type"] = "object"

    if not any(key in compatible for key in _OPENAI_UNSUPPORTED_ROOT_SCHEMA_KEYS):
        return compatible

    branch_schemas: list[Dict[str, Any]] = []
    for key in ("oneOf", "anyOf", "allOf"):
        branches = compatible.pop(key, None)
        if isinstance(branches, list):
            branch_schemas.extend(branch for branch in branches if isinstance(branch, dict))

    compatible.pop("enum", None)
    compatible.pop("not", None)

    for branch in branch_schemas:
        branch_properties = branch.get("properties")
        if not isinstance(branch_properties, dict):
            continue
        for property_name, property_schema in branch_properties.items():
            if property_name == "action" and "action" in root_properties:
                continue
            if not isinstance(property_schema, dict):
                continue
            existing = root_properties.get(property_name)
            if not isinstance(existing, dict):
                root_properties[property_name] = deepcopy(property_schema)
                continue
            root_properties[property_name] = _merge_openai_property_schema(
                existing,
                property_schema,
            )

    description = compatible.get("description")
    if isinstance(description, str):
        if _OPENAI_COMPATIBILITY_NOTE not in description:
            compatible["description"] = f"{description} {_OPENAI_COMPATIBILITY_NOTE}"
    else:
        compatible["description"] = _OPENAI_COMPATIBILITY_NOTE

    return compatible


def make_openai_chat_tools_compatible(
    tools: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    compatible_tools: List[Dict[str, Any]] = []
    for tool in tools:
        if not isinstance(tool, dict):
            compatible_tools.append(tool)
            continue
        function_payload = tool.get("function")
        if not isinstance(function_payload, dict):
            compatible_tools.append(tool)
            continue
        parameters = function_payload.get("parameters")
        if not isinstance(parameters, dict):
            compatible_tools.append(tool)
            continue

        compatible_tool = deepcopy(tool)
        compatible_tool["function"]["parameters"] = make_openai_parameters_compatible(
            parameters
        )
        compatible_tools.append(compatible_tool)
    return compatible_tools


def build_openai_responses_tools(
    tools: Optional[List[Dict[str, Any]]],
    *,
    native_web_search_enabled: bool = False,
) -> Optional[List[Dict[str, Any]]]:
    normalized: List[Dict[str, Any]] = []
    if tools is not None:
        for tool in tools:
            if is_computer_tool_spec(tool):
                normalized.append({"type": "computer"})
                continue
            if not is_function_tool_spec(tool):
                continue
            normalized.append(
                {
                    "type": "function",
                    "name": tool.get("name"),
                    "description": tool.get("description"),
                    "parameters": make_openai_parameters_compatible(
                        tool.get("parameters") or {}
                    ),
                    "strict": bool(tool.get("strict", False)),
                }
            )
    if native_web_search_enabled:
        normalized.append({"type": "web_search"})
    if not normalized:
        return None
    return normalized
