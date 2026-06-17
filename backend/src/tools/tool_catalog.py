"""Canonical metadata for backend tool registration and model-facing exposure."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from importlib import import_module
from typing import Any, Optional

from backend.src.tools.tool_specs import is_function_tool_spec


@dataclass(frozen=True, slots=True)
class ToolCatalogEntry:
    name: str
    module_path: str
    class_name: str
    model_visible: bool = True
    client_executable: bool = True


@dataclass(frozen=True, slots=True)
class BuiltToolCatalogEntry:
    entry: ToolCatalogEntry
    tool_class: type[Any]
    tool_spec: dict[str, Any]


_CATALOG: tuple[ToolCatalogEntry, ...] = (
    ToolCatalogEntry(
        "mouse_control", "backend.src.tools.remote_tools.computer", "RemoteMouseTool"
    ),
    ToolCatalogEntry(
        "grounded_mouse_action",
        "backend.src.tools.remote_tools.computer",
        "RemoteGroundedMouseTool",
        client_executable=False,
    ),
    ToolCatalogEntry(
        "keyboard_control",
        "backend.src.tools.remote_tools.computer",
        "RemoteKeyboardTool",
    ),
    ToolCatalogEntry(
        "screenshot", "backend.src.tools.remote_tools.computer", "RemoteScreenshotTool"
    ),
    ToolCatalogEntry(
        "scroll_control", "backend.src.tools.remote_tools.computer", "RemoteScrollTool"
    ),
    ToolCatalogEntry(
        "grounded_scroll_action",
        "backend.src.tools.remote_tools.computer",
        "RemoteGroundedScrollTool",
        client_executable=False,
    ),
    ToolCatalogEntry(
        "switch_window",
        "backend.src.tools.remote_tools.computer",
        "RemoteSwitchTabTool",
    ),
    ToolCatalogEntry(
        "wait", "backend.src.tools.remote_tools.computer", "RemoteWaitTool"
    ),
    ToolCatalogEntry(
        "get_open_windows",
        "backend.src.tools.remote_tools.computer",
        "RemoteGetOpenWindowsTool",
    ),
    ToolCatalogEntry(
        "get_system_stats",
        "backend.src.tools.remote_tools.system",
        "RemoteGetSystemStatsTool",
    ),
    ToolCatalogEntry(
        "open_app", "backend.src.tools.remote_tools.system", "RemoteOpenAppTool"
    ),
    ToolCatalogEntry(
        "run_shell_command", "backend.src.tools.remote_tools.system", "RemoteShellTool"
    ),
    ToolCatalogEntry(
        "process", "backend.src.tools.remote_tools.system", "RemoteProcessTool"
    ),
    ToolCatalogEntry(
        "read_file", "backend.src.tools.remote_tools.filesystem", "RemoteReadFileTool"
    ),
    ToolCatalogEntry(
        "replace", "backend.src.tools.remote_tools.filesystem", "RemoteReplaceTool"
    ),
    ToolCatalogEntry(
        "browser", "backend.src.tools.remote_tools.browser", "RemoteBrowserTool"
    ),
)
_CATALOG_BY_NAME = {entry.name: entry for entry in _CATALOG}


def get_tool_catalog() -> tuple[ToolCatalogEntry, ...]:
    return _CATALOG


def get_tool_catalog_entry(tool_name: str) -> Optional[ToolCatalogEntry]:
    return _CATALOG_BY_NAME.get(tool_name)


def resolve_tool_class(entry: ToolCatalogEntry):
    module = import_module(entry.module_path)
    return getattr(module, entry.class_name)


def build_tool_catalog_entry(entry: ToolCatalogEntry) -> BuiltToolCatalogEntry:
    tool_class = resolve_tool_class(entry)
    build_spec = getattr(tool_class, "build_tool_spec", None)
    if not callable(build_spec):
        raise TypeError(
            f"Tool class {tool_class!r} does not expose build_tool_spec(); "
            "catalog tools must define their canonical spec at the class layer."
        )

    tool_spec = build_spec()
    if not is_function_tool_spec(tool_spec):
        raise ValueError(
            f"Tool class {tool_class.__name__} emitted non-canonical tool spec"
        )
    return BuiltToolCatalogEntry(
        entry=entry,
        tool_class=tool_class,
        tool_spec=copy.deepcopy(tool_spec),
    )


def get_built_tool_catalog() -> tuple[BuiltToolCatalogEntry, ...]:
    return tuple(build_tool_catalog_entry(entry) for entry in _CATALOG)


def get_built_tool_catalog_entry(tool_name: str) -> Optional[BuiltToolCatalogEntry]:
    entry = get_tool_catalog_entry(tool_name)
    if entry is None:
        return None
    return build_tool_catalog_entry(entry)


def get_remote_tool_class(tool_name: str):
    entry = get_tool_catalog_entry(tool_name)
    if entry is None:
        return None
    return resolve_tool_class(entry)


def get_all_remote_tool_classes() -> dict[str, type]:
    return {built.entry.name: built.tool_class for built in get_built_tool_catalog()}


def get_model_visible_tool_names() -> list[str]:
    return [entry.name for entry in _CATALOG if entry.model_visible]


def get_client_executable_tool_names() -> list[str]:
    return [entry.name for entry in _CATALOG if entry.client_executable]
