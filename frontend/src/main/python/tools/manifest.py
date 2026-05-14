"""Sidecar-owned executable schema export for local tools."""

from __future__ import annotations

from typing import Any

from tools.browser.schemas import build_browser_tool_parameters_schema
from tools.schemas import (
    GetOpenWindowsArgs,
    GetSystemStatsArgs,
    KeyboardControlArgs,
    MouseControlArgs,
    OpenAppArgs,
    ProcessShellCommandArgs,
    ReadFileArgs,
    ReplaceArgs,
    RunShellCommandArgs,
    ScreenshotToolArgs,
    ScrollControlArgs,
    SwitchTabArgs,
    WaitToolArgs,
)


EXECUTION_SCHEMA_MODELS = {
    "mouse_control": MouseControlArgs,
    "keyboard_control": KeyboardControlArgs,
    "screenshot": ScreenshotToolArgs,
    "scroll_control": ScrollControlArgs,
    "switch_window": SwitchTabArgs,
    "wait": WaitToolArgs,
    "get_open_windows": GetOpenWindowsArgs,
    "get_system_stats": GetSystemStatsArgs,
    "open_app": OpenAppArgs,
    "run_shell_command": RunShellCommandArgs,
    "process": ProcessShellCommandArgs,
    "read_file": ReadFileArgs,
    "replace": ReplaceArgs,
}


def _clean_schema(schema: Any) -> Any:
    if isinstance(schema, list):
        return [_clean_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    cleaned: dict[str, Any] = {}
    for key, value in schema.items():
        if key in {"title", "$defs"}:
            continue
        if key == "$ref":
            continue
        if key == "anyOf":
            non_null = (
                [
                    item
                    for item in value
                    if isinstance(item, dict) and item.get("type") != "null"
                ]
                if isinstance(value, list)
                else []
            )
            if len(non_null) == 1:
                cleaned.update(_clean_schema(non_null[0]))
            else:
                cleaned[key] = _clean_schema(value)
            continue
        cleaned[key] = _clean_schema(value)
    return cleaned


def build_execution_schema(tool_name: str) -> dict[str, Any] | None:
    if tool_name == "browser":
        return build_browser_tool_parameters_schema()
    model = EXECUTION_SCHEMA_MODELS.get(tool_name)
    if model is None:
        return None
    schema = _clean_schema(model.model_json_schema())
    schema.setdefault("type", "object")
    return schema


def build_sidecar_tool_manifest(
    tool_names: set[str] | list[str],
    extension_execution_schemas: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    tools = []
    for tool_name in sorted(tool_names):
        execution_schema = build_execution_schema(tool_name)
        if execution_schema is None:
            continue
        tools.append(
            {
                "name": tool_name,
                "execution_schema": execution_schema,
            }
        )
    for tool_name, execution_schema in sorted(
        (extension_execution_schemas or {}).items()
    ):
        tools.append(
            {
                "name": tool_name,
                "execution_schema": execution_schema,
            }
        )
    return {
        "version": 1,
        "tools": tools,
    }
