"""Canonical metadata for backend tool registration and model-facing schemas."""

from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
from typing import Iterable, Optional, Sequence


@dataclass(frozen=True, slots=True)
class ToolCatalogEntry:
    name: str
    module_path: str
    class_name: str
    model_visible: bool = False
    wrapper_name: Optional[str] = None


@dataclass(frozen=True, slots=True)
class WrapperSpec:
    name: str
    members: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ResolvedModelToolSurface:
    ordered_names: tuple[str, ...]
    wrapper_members: dict[str, tuple[str, ...]]


_COMPUTER_WRAPPER = WrapperSpec(
    name="computer_use",
    members=(
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "scroll_control",
        "switch_tab",
        "wait",
    ),
)
_SYSTEM_WRAPPER = WrapperSpec(
    name="system_use",
    members=(
        "run_shell_command",
        "replace",
        "read_file",
        "get_system_stats",
        "get_open_windows",
    ),
)
_WRAPPER_SPECS: tuple[WrapperSpec, ...] = (
    _COMPUTER_WRAPPER,
    _SYSTEM_WRAPPER,
)
_WRAPPER_SPEC_BY_NAME = {spec.name: spec for spec in _WRAPPER_SPECS}
_MEMBER_TO_WRAPPER = {
    member_name: spec.name
    for spec in _WRAPPER_SPECS
    for member_name in spec.members
}

_CATALOG: tuple[ToolCatalogEntry, ...] = (
    ToolCatalogEntry("computer_use", "backend.src.tools.remote_tools.computer", "RemoteComputerUseTool", model_visible=True),
    ToolCatalogEntry("mouse_control", "backend.src.tools.remote_tools.computer", "RemoteMouseTool", wrapper_name="computer_use"),
    ToolCatalogEntry("keyboard_control", "backend.src.tools.remote_tools.computer", "RemoteKeyboardTool", wrapper_name="computer_use"),
    ToolCatalogEntry("screenshot", "backend.src.tools.remote_tools.computer", "RemoteScreenshotTool", wrapper_name="computer_use"),
    ToolCatalogEntry("scroll_control", "backend.src.tools.remote_tools.computer", "RemoteScrollTool", wrapper_name="computer_use"),
    ToolCatalogEntry("switch_tab", "backend.src.tools.remote_tools.computer", "RemoteSwitchTabTool", wrapper_name="computer_use"),
    ToolCatalogEntry("wait", "backend.src.tools.remote_tools.computer", "RemoteWaitTool", wrapper_name="computer_use"),
    ToolCatalogEntry("system_use", "backend.src.tools.remote_tools.system", "RemoteSystemUseTool", model_visible=True),
    ToolCatalogEntry("get_open_windows", "backend.src.tools.remote_tools.computer", "RemoteGetOpenWindowsTool", wrapper_name="system_use"),
    ToolCatalogEntry("get_system_stats", "backend.src.tools.remote_tools.system", "RemoteGetSystemStatsTool", wrapper_name="system_use"),
    ToolCatalogEntry("open_app", "backend.src.tools.remote_tools.system", "RemoteOpenAppTool", model_visible=True),
    ToolCatalogEntry("run_shell_command", "backend.src.tools.remote_tools.system", "RemoteShellTool", wrapper_name="system_use"),
    ToolCatalogEntry("process", "backend.src.tools.remote_tools.system", "RemoteProcessTool", model_visible=True),
    ToolCatalogEntry("read_file", "backend.src.tools.remote_tools.filesystem", "RemoteReadFileTool", wrapper_name="system_use"),
    ToolCatalogEntry("replace", "backend.src.tools.remote_tools.filesystem", "RemoteReplaceTool", wrapper_name="system_use"),
    ToolCatalogEntry("browser", "backend.src.tools.remote_tools.browser", "RemoteBrowserTool", model_visible=True),
)
_CATALOG_BY_NAME = {entry.name: entry for entry in _CATALOG}
_MODEL_VISIBLE_DIRECT_TOOLS: tuple[str, ...] = tuple(
    entry.name
    for entry in _CATALOG
    if entry.model_visible and entry.name not in _WRAPPER_SPEC_BY_NAME
)
_SCHEMA_SOURCE_TOOL_NAMES: tuple[str, ...] = tuple(
    entry.name
    for entry in _CATALOG
    if entry.wrapper_name is not None or entry.name in _MODEL_VISIBLE_DIRECT_TOOLS
)


def get_tool_catalog() -> tuple[ToolCatalogEntry, ...]:
    return _CATALOG


def get_tool_catalog_entry(tool_name: str) -> Optional[ToolCatalogEntry]:
    return _CATALOG_BY_NAME.get(tool_name)


def resolve_tool_class(entry: ToolCatalogEntry):
    module = import_module(entry.module_path)
    return getattr(module, entry.class_name)


def get_wrapper_specs() -> tuple[WrapperSpec, ...]:
    return _WRAPPER_SPECS


def get_wrapper_spec(wrapper_name: str) -> Optional[WrapperSpec]:
    return _WRAPPER_SPEC_BY_NAME.get(wrapper_name)


def is_wrapper_tool(tool_name: str) -> bool:
    return tool_name in _WRAPPER_SPEC_BY_NAME


def get_wrapper_member_names(wrapper_name: str) -> tuple[str, ...]:
    spec = get_wrapper_spec(wrapper_name)
    return spec.members if spec is not None else ()


def get_wrapper_name_for_tool(tool_name: str) -> Optional[str]:
    return _MEMBER_TO_WRAPPER.get(tool_name)


def get_schema_source_tool_names() -> list[str]:
    return list(_SCHEMA_SOURCE_TOOL_NAMES)


def get_model_visible_tool_names() -> list[str]:
    return [spec.name for spec in _WRAPPER_SPECS] + list(_MODEL_VISIBLE_DIRECT_TOOLS)


def get_backend_exposed_tool_names() -> list[str]:
    """Return all backend-registered remote tool names exposed to the sidecar contract."""
    return [entry.name for entry in _CATALOG]


def normalize_model_tool_name(tool_name: str) -> str:
    return get_wrapper_name_for_tool(tool_name) or tool_name


def expand_model_tool_name(tool_name: str) -> set[str]:
    spec = get_wrapper_spec(tool_name)
    if spec is None:
        return {tool_name}
    return {tool_name, *spec.members}


def expand_model_tool_names(tool_names: Iterable[str]) -> set[str]:
    expanded: set[str] = set()
    for tool_name in tool_names:
        if isinstance(tool_name, str):
            expanded.update(expand_model_tool_name(tool_name))
    return expanded


def resolve_model_tool_surface(
    requested_names: Sequence[str],
    *,
    available_names: Optional[Iterable[str]] = None,
) -> ResolvedModelToolSurface:
    requested_set = {
        name
        for name in requested_names
        if isinstance(name, str)
    }
    available_set = (
        {
            name
            for name in available_names
            if isinstance(name, str)
        }
        if available_names is not None
        else set(_CATALOG_BY_NAME)
    )

    ordered_names: list[str] = []
    wrapper_members: dict[str, tuple[str, ...]] = {}

    for spec in _WRAPPER_SPECS:
        include_all_members = spec.name in requested_set
        members = tuple(
            member_name
            for member_name in spec.members
            if member_name in available_set and (include_all_members or member_name in requested_set)
        )
        if members:
            ordered_names.append(spec.name)
            wrapper_members[spec.name] = members

    for tool_name in _MODEL_VISIBLE_DIRECT_TOOLS:
        if tool_name in requested_set and tool_name in available_set:
            ordered_names.append(tool_name)

    return ResolvedModelToolSurface(
        ordered_names=tuple(ordered_names),
        wrapper_members=wrapper_members,
    )
