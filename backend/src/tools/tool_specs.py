"""Canonical internal model-facing tool spec helpers."""

from __future__ import annotations

import copy
from typing import Any, Dict, Literal, Optional, TypedDict


class FunctionToolSpec(TypedDict, total=False):
    """Canonical internal function-tool contract."""

    type: Literal["function"]
    name: str
    description: str
    strict: bool
    parameters: Dict[str, Any]


class ComputerToolSpec(TypedDict, total=False):
    """Canonical internal built-in computer tool contract."""

    type: Literal["computer"]


def build_function_tool_spec(
    *,
    name: str,
    description: Optional[str],
    parameters: Dict[str, Any],
    strict: bool = False,
) -> FunctionToolSpec:
    spec: FunctionToolSpec = {
        "type": "function",
        "name": name,
        "strict": strict,
        "parameters": copy.deepcopy(parameters),
    }
    if isinstance(description, str):
        spec["description"] = description
    return spec


def is_function_tool_spec(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    if value.get("type") != "function":
        return False
    if not isinstance(value.get("name"), str) or not value["name"].strip():
        return False
    if not isinstance(value.get("parameters"), dict):
        return False
    description = value.get("description")
    if description is not None and not isinstance(description, str):
        return False
    strict = value.get("strict")
    if strict is not None and not isinstance(strict, bool):
        return False
    return True


def build_computer_tool_spec() -> ComputerToolSpec:
    return {"type": "computer"}


def is_computer_tool_spec(value: Any) -> bool:
    return isinstance(value, dict) and value.get("type") == "computer"


def get_tool_spec_name(tool: Dict[str, Any]) -> Optional[str]:
    if not is_function_tool_spec(tool):
        return None
    return str(tool["name"])


def get_tool_spec_parameters(tool: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not is_function_tool_spec(tool):
        return None
    parameters = tool.get("parameters")
    return parameters if isinstance(parameters, dict) else None


def to_litellm_function_tool(tool: Dict[str, Any]) -> Dict[str, Any]:
    if not is_function_tool_spec(tool):
        raise ValueError("Expected canonical flat function tool spec")
    function_payload: Dict[str, Any] = {
        "name": tool["name"],
        "parameters": copy.deepcopy(tool["parameters"]),
    }
    if isinstance(tool.get("description"), str):
        function_payload["description"] = tool["description"]
    if isinstance(tool.get("strict"), bool):
        function_payload["strict"] = tool["strict"]
    return {
        "type": "function",
        "function": function_payload,
    }


def to_litellm_tool_choice(tool_choice: Any) -> Any:
    if tool_choice is None or isinstance(tool_choice, str):
        return tool_choice
    if not isinstance(tool_choice, dict):
        return tool_choice

    choice_type = tool_choice.get("type")
    if choice_type in {"none", "auto", "required"}:
        return choice_type
    if choice_type == "function":
        name = tool_choice.get("name")
        if not isinstance(name, str):
            function_payload = tool_choice.get("function")
            if isinstance(function_payload, dict):
                name = function_payload.get("name")
        if isinstance(name, str) and name.strip():
            return {"type": "function", "function": {"name": name.strip()}}
    return tool_choice
