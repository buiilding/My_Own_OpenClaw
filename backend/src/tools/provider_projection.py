"""Provider-aware model-facing tool projection helpers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.src.tools.tool_specs import build_computer_tool_spec

_OPENAI_PROVIDER = "openai"
_DIRECT_OPENAI_COMPUTER_TOOLS = (
    "mouse_control",
    "keyboard_control",
    "screenshot",
    "scroll_control",
    "wait",
)
_OPENAI_GROUNDED_TOOL_NAMES = (
    "grounded_mouse_action",
    "grounded_scroll_action",
)


def should_project_openai_native_computer(config: Any) -> bool:
    provider_name = str(getattr(config, "model_provider", "") or "").strip().lower()
    return provider_name == _OPENAI_PROVIDER


def project_tool_schemas_for_provider(
    *,
    tool_schemas: List[Dict[str, Any]],
    tool_registry: Any | None,
    config: Any,
) -> List[Dict[str, Any]]:
    if not should_project_openai_native_computer(config):
        return list(tool_schemas)

    names = [
        schema.get("name")
        for schema in tool_schemas
        if isinstance(schema, dict) and isinstance(schema.get("name"), str)
    ]
    if not _supports_openai_native_computer_projection(names):
        return list(tool_schemas)

    projected: List[Dict[str, Any]] = []
    added_computer = False
    added_grounded = False
    for schema in tool_schemas:
        if not isinstance(schema, dict):
            continue
        tool_name = schema.get("name")
        if tool_name in _DIRECT_OPENAI_COMPUTER_TOOLS:
            if not added_computer:
                projected.append(build_computer_tool_spec())
                added_computer = True
            if not added_grounded and tool_registry is not None:
                projected.extend(
                    _lookup_registry_schemas(
                        tool_registry,
                        list(_OPENAI_GROUNDED_TOOL_NAMES),
                    )
                )
                added_grounded = True
            continue
        projected.append(schema)

    return projected


def _supports_openai_native_computer_projection(tool_names: List[Optional[str]]) -> bool:
    visible = {name for name in tool_names if isinstance(name, str)}
    return all(name in visible for name in _DIRECT_OPENAI_COMPUTER_TOOLS)


def _lookup_registry_schemas(
    tool_registry: Any,
    tool_names: List[str],
) -> List[Dict[str, Any]]:
    getter = getattr(tool_registry, "get_function_declarations_filtered", None)
    if not callable(getter):
        return []
    schemas = getter(tool_names)
    if not isinstance(schemas, list):
        return []
    return [schema for schema in schemas if isinstance(schema, dict)]
