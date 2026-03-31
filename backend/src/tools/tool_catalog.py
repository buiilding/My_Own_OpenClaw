"""Canonical metadata for backend tool registration and model-facing exposure."""

from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
from typing import Optional


@dataclass(frozen=True, slots=True)
class ToolCatalogEntry:
    name: str
    module_path: str
    class_name: str
    model_visible: bool = True


_CATALOG: tuple[ToolCatalogEntry, ...] = (
    ToolCatalogEntry("mouse_control", "backend.src.tools.remote_tools.computer", "RemoteMouseTool"),
    ToolCatalogEntry("keyboard_control", "backend.src.tools.remote_tools.computer", "RemoteKeyboardTool"),
    ToolCatalogEntry("screenshot", "backend.src.tools.remote_tools.computer", "RemoteScreenshotTool"),
    ToolCatalogEntry("scroll_control", "backend.src.tools.remote_tools.computer", "RemoteScrollTool"),
    ToolCatalogEntry("switch_tab", "backend.src.tools.remote_tools.computer", "RemoteSwitchTabTool"),
    ToolCatalogEntry("wait", "backend.src.tools.remote_tools.computer", "RemoteWaitTool"),
    ToolCatalogEntry("get_open_windows", "backend.src.tools.remote_tools.computer", "RemoteGetOpenWindowsTool"),
    ToolCatalogEntry("get_system_stats", "backend.src.tools.remote_tools.system", "RemoteGetSystemStatsTool"),
    ToolCatalogEntry("open_app", "backend.src.tools.remote_tools.system", "RemoteOpenAppTool"),
    ToolCatalogEntry("run_shell_command", "backend.src.tools.remote_tools.system", "RemoteShellTool"),
    ToolCatalogEntry("process", "backend.src.tools.remote_tools.system", "RemoteProcessTool"),
    ToolCatalogEntry("read_file", "backend.src.tools.remote_tools.filesystem", "RemoteReadFileTool"),
    ToolCatalogEntry("replace", "backend.src.tools.remote_tools.filesystem", "RemoteReplaceTool"),
    ToolCatalogEntry("browser", "backend.src.tools.remote_tools.browser", "RemoteBrowserTool"),
)
_CATALOG_BY_NAME = {entry.name: entry for entry in _CATALOG}


def get_tool_catalog() -> tuple[ToolCatalogEntry, ...]:
    return _CATALOG


def get_tool_catalog_entry(tool_name: str) -> Optional[ToolCatalogEntry]:
    return _CATALOG_BY_NAME.get(tool_name)


def resolve_tool_class(entry: ToolCatalogEntry):
    module = import_module(entry.module_path)
    return getattr(module, entry.class_name)


def get_remote_tool_class(tool_name: str):
    entry = get_tool_catalog_entry(tool_name)
    if entry is None:
        return None
    return resolve_tool_class(entry)


def get_all_remote_tool_classes() -> dict[str, type]:
    return {
        entry.name: resolve_tool_class(entry)
        for entry in _CATALOG
    }


def get_model_visible_tool_names() -> list[str]:
    return [entry.name for entry in _CATALOG if entry.model_visible]


def get_backend_exposed_tool_names() -> list[str]:
    return [entry.name for entry in _CATALOG]
