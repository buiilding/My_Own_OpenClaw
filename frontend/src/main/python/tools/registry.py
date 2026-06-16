"""
Tool Registry for Local Backend.

Registers and executes all available tools.
"""

import asyncio
import copy
import inspect
from importlib import import_module
import logging
import sys
from pathlib import Path
from typing import Any, Callable, Dict

from tools.extension_loader import (
    TOOL_NAME_PATTERN,
    load_sidecar_plugin_path,
    load_sidecar_plugin_tools,
)
from tools.manifest import EXPOSED_TO_BACKEND_TOOL_NAMES, build_sidecar_tool_manifest
from tools.result import ToolResult

logger = logging.getLogger(__name__)

TOOL_CATALOG: tuple[tuple[str, str, str], ...] = (
    ("mouse_control", "tools.computer.mouse_tool", "execute_mouse_control"),
    ("keyboard_control", "tools.computer.keyboard_tool", "execute_keyboard_control"),
    ("screenshot", "tools.computer.screenshot_tool", "capture_screenshot"),
    ("scroll_control", "tools.computer.scroll_tool", "execute_scroll_control"),
    ("read_file", "tools.filesystem.read_file_tool", "read_file"),
    ("replace", "tools.filesystem.replace_tool", "replace"),
    ("run_shell_command", "tools.system.shell_tool", "run_shell_command"),
    ("open_app", "tools.system.open_app_tool", "open_app"),
    ("process", "tools.system.process_tool", "process_shell_command"),
    ("get_system_stats", "tools.system.stats_tool", "get_system_stats"),
    ("wait", "tools.system.wait_tool", "wait"),
    ("browser", "tools.browser.browser_tool", "execute_browser"),
)


class ToolRegistry:
    """
    Registry for all available tools.

    Handles tool registration and execution.
    """

    def __init__(self):
        self.tools: Dict[str, Callable[..., Any]] = {}
        self.dynamic_tool_schemas: dict[str, dict[str, Any]] = {}
        self.dynamic_tool_descriptions: dict[str, str] = {}
        self.dynamic_tool_sources: dict[str, dict[str, Any]] = {}
        self._register_tools()

    def has_tool(self, tool_name: str) -> bool:
        return tool_name in self.tools

    def reload_tools(self) -> None:
        self.tools.clear()
        self.dynamic_tool_schemas.clear()
        self.dynamic_tool_descriptions.clear()
        self.dynamic_tool_sources.clear()
        self._register_tools()

    def _register_tools(self):
        """Register all available tools."""
        for tool_name, module_name, attr_name in TOOL_CATALOG:
            try:
                self.tools[tool_name] = self._build_lazy_tool(
                    module_name=module_name,
                    attr_name=attr_name,
                )
            except ImportError as e:
                logger.warning(f"Failed to register {tool_name}: {e}")

        try:
            from tools.system.window_tool import switch_to_window, get_open_windows

            self.tools["switch_window"] = switch_to_window
            self.tools["get_open_windows"] = get_open_windows
        except ImportError as e:
            logger.warning(f"Failed to import window_tool: {e}")

        self._register_plugin_tools()

        missing_exposed_tools = EXPOSED_TO_BACKEND_TOOL_NAMES - set(self.tools.keys())
        if missing_exposed_tools:
            logger.warning(
                "Tools expected by backend schemas are unavailable in sidecar runtime: %s",
                ", ".join(sorted(missing_exposed_tools)),
            )

        logger.debug(
            f"Registered {len(self.tools)} tools: {', '.join(self.tools.keys())}"
        )

    def _register_plugin_tools(self) -> None:
        loaded_plugins = load_sidecar_plugin_tools()
        for error in loaded_plugins.errors:
            logger.warning(
                "Failed to load plugin tool from %s: %s",
                error.get("plugin", "unknown"),
                error.get("reason", "unknown error"),
            )

        for tool_name, loaded_tool in loaded_plugins.tools.items():
            if tool_name in self.tools:
                logger.warning(
                    "Skipping plugin tool %s from %s because a built-in tool already uses that name",
                    tool_name,
                    loaded_tool.plugin_id,
                )
                continue
            self.tools[tool_name] = loaded_tool.handler
            self.dynamic_tool_schemas[tool_name] = copy.deepcopy(loaded_tool.schema)
            if loaded_tool.description:
                self.dynamic_tool_descriptions[tool_name] = loaded_tool.description
            self.dynamic_tool_sources[tool_name] = {
                "kind": "plugin",
                "plugin_id": loaded_tool.plugin_id,
            }

    def register_module_tool(
        self,
        *,
        name: str,
        module: str,
        schema: dict[str, Any],
        description: str | None = None,
        workspace_path: str | None = None,
    ) -> dict[str, Any]:
        """Register a module-path tool without restarting the sidecar runtime."""
        self._validate_dynamic_tool_name(name)
        if not isinstance(module, str) or ":" not in module:
            raise ValueError("module must use the module:function format")
        if not isinstance(schema, dict):
            raise ValueError("schema must be an object")
        if name in EXPOSED_TO_BACKEND_TOOL_NAMES:
            raise ValueError(f"cannot override built-in sidecar tool: {name}")

        module_name, attr_name = module.split(":", 1)
        module_name = module_name.strip()
        attr_name = attr_name.strip()
        if not module_name or not attr_name:
            raise ValueError("module must include both module name and function name")

        search_path = None
        if workspace_path:
            search_path = str(Path(workspace_path).expanduser().resolve())
            if search_path not in sys.path:
                sys.path.insert(0, search_path)

        imported_module = import_module(module_name)
        handler = getattr(imported_module, attr_name, None)
        if not callable(handler):
            raise ValueError(f"module tool entrypoint is not callable: {module}")

        self.tools[name] = self._wrap_module_handler(handler)
        self.dynamic_tool_schemas[name] = copy.deepcopy(schema)
        if description:
            self.dynamic_tool_descriptions[name] = description
        else:
            self.dynamic_tool_descriptions.pop(name, None)
        self.dynamic_tool_sources[name] = {
            "kind": "module",
            "module": module,
            "workspace_path": search_path,
        }
        return self.describe_tool(name)

    def register_plugin_tools(
        self,
        *,
        plugin_path: str,
    ) -> dict[str, Any]:
        """Load sidecar plugin tools from a local package path."""
        loaded_plugins = load_sidecar_plugin_path(plugin_path)
        registered: list[dict[str, Any]] = []
        for error in loaded_plugins.errors:
            logger.warning(
                "Failed to dynamically load plugin tool from %s: %s",
                error.get("plugin", "unknown"),
                error.get("reason", "unknown error"),
            )

        for tool_name, loaded_tool in loaded_plugins.tools.items():
            self._validate_dynamic_tool_name(tool_name)
            if tool_name in EXPOSED_TO_BACKEND_TOOL_NAMES:
                raise ValueError(f"cannot override built-in sidecar tool: {tool_name}")
            self.tools[tool_name] = loaded_tool.handler
            self.dynamic_tool_schemas[tool_name] = copy.deepcopy(loaded_tool.schema)
            if loaded_tool.description:
                self.dynamic_tool_descriptions[tool_name] = loaded_tool.description
            self.dynamic_tool_sources[tool_name] = {
                "kind": "plugin",
                "plugin_path": str(Path(plugin_path).expanduser().resolve()),
                "plugin_id": loaded_tool.plugin_id,
            }
            registered.append(self.describe_tool(tool_name))
        return {
            "registered_tools": registered,
            "errors": loaded_plugins.errors,
        }

    def register_runtime_tool(
        self,
        *,
        name: str,
        handler: Callable[..., Any],
        schema: dict[str, Any],
        description: str | None = None,
        source: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Register a runtime-owned handler such as an MCP proxy tool."""
        self._validate_dynamic_tool_name(name)
        if not isinstance(schema, dict):
            raise ValueError("schema must be an object")
        if name in EXPOSED_TO_BACKEND_TOOL_NAMES:
            raise ValueError(f"cannot override built-in sidecar tool: {name}")
        self.tools[name] = handler
        self.dynamic_tool_schemas[name] = copy.deepcopy(schema)
        if description:
            self.dynamic_tool_descriptions[name] = description
        self.dynamic_tool_sources[name] = dict(source or {"kind": "runtime"})
        return self.describe_tool(name)

    def unregister_dynamic_tool(self, name: str) -> bool:
        """Remove a non-built-in dynamic/runtime tool."""
        if name in EXPOSED_TO_BACKEND_TOOL_NAMES:
            return False
        existed = name in self.tools
        self.tools.pop(name, None)
        self.dynamic_tool_schemas.pop(name, None)
        self.dynamic_tool_descriptions.pop(name, None)
        self.dynamic_tool_sources.pop(name, None)
        return existed

    def unregister_dynamic_tools_by_source(
        self,
        *,
        kind: str | None = None,
        server_id: str | None = None,
    ) -> list[str]:
        """Remove dynamic tools matching source metadata."""
        removed: list[str] = []
        for tool_name, source in list(self.dynamic_tool_sources.items()):
            if kind is not None and source.get("kind") != kind:
                continue
            if server_id is not None and source.get("server_id") != server_id:
                continue
            if self.unregister_dynamic_tool(tool_name):
                removed.append(tool_name)
        return removed

    @staticmethod
    def get_exposed_tool_names() -> set[str]:
        """Return sidecar tools that are expected to be exposed by backend schemas."""
        return set(EXPOSED_TO_BACKEND_TOOL_NAMES)

    def get_tool_manifest(self) -> dict[str, Any]:
        """Return diagnostic schemas for exposed built-in sidecar tools."""
        exposed_registered_tools = EXPOSED_TO_BACKEND_TOOL_NAMES & set(
            self.tools.keys()
        )
        manifest = build_sidecar_tool_manifest(exposed_registered_tools)
        for tool_name in sorted(self.dynamic_tool_schemas):
            if tool_name not in self.tools:
                continue
            tool_manifest = {
                "name": tool_name,
                "schema": copy.deepcopy(self.dynamic_tool_schemas[tool_name]),
                "execution_target": "sidecar",
                "argument_resolution": "passthrough",
            }
            description = self.dynamic_tool_descriptions.get(tool_name)
            if description:
                tool_manifest["description"] = description
            source = self.dynamic_tool_sources.get(tool_name)
            if source:
                tool_manifest["source"] = copy.deepcopy(source)
                if source.get("kind") == "mcp":
                    if source.get("server_id"):
                        tool_manifest["mcp_server_id"] = source["server_id"]
                    if source.get("tool_name"):
                        tool_manifest["mcp_tool_name"] = source["tool_name"]
                    if source.get("extension_id"):
                        tool_manifest["extension_id"] = source["extension_id"]
            manifest["tools"].append(tool_manifest)
        return manifest

    def describe_tool(self, tool_name: str) -> dict[str, Any]:
        manifest_tools = self.get_tool_manifest().get("tools", [])
        for tool in manifest_tools:
            if tool.get("name") == tool_name:
                return copy.deepcopy(tool)
        if tool_name not in self.tools:
            raise ValueError(f"tool is not registered: {tool_name}")
        return {"name": tool_name}

    @staticmethod
    def _validate_dynamic_tool_name(tool_name: str) -> None:
        if not isinstance(tool_name, str) or not TOOL_NAME_PATTERN.match(tool_name):
            raise ValueError("tool name is missing or invalid")

    @staticmethod
    def _wrap_module_handler(
        handler: Callable[..., Any],
    ) -> Callable[[dict[str, Any]], Any]:
        signature = inspect.signature(handler)
        parameters = list(signature.parameters.values())
        accepts_raw_args = (
            len(parameters) == 1
            and parameters[0].name in {"args", "params", "payload"}
            and parameters[0].kind
            in {
                inspect.Parameter.POSITIONAL_ONLY,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
            }
        )
        if accepts_raw_args:
            return handler

        async def _async_wrapper(args: dict[str, Any]) -> Any:
            try:
                bound = signature.bind(**args)
            except TypeError as exc:
                raise ValueError(
                    f"module tool arguments do not match entrypoint: {exc}"
                ) from exc
            result = handler(**bound.arguments)
            if inspect.isawaitable(result):
                return await result
            return result

        return _async_wrapper

    @staticmethod
    def _build_lazy_tool(module_name: str, attr_name: str) -> Callable[..., Any]:
        """Lazily import heavy tool modules only when they are first executed."""
        resolved_tool: Callable[..., Any] | None = None

        async def _lazy_tool(args: Dict[str, Any]) -> Any:
            nonlocal resolved_tool
            if resolved_tool is None:
                module = import_module(module_name)
                resolved_tool = getattr(module, attr_name)
            if asyncio.iscoroutinefunction(resolved_tool):
                return await resolved_tool(args)
            return resolved_tool(args)

        return _lazy_tool

    async def execute_tool(self, tool_name: str, args: Dict[str, Any]) -> ToolResult:
        """
        Execute a tool.

        Args:
            tool_name: Name of the tool
            args: Tool arguments

        Returns:
            ToolResult object with standardized structure
        """
        tool = self.tools.get(tool_name)
        if not tool:
            return ToolResult.error_result(f"Tool not found: {tool_name}")

        if not isinstance(args, dict):
            return ToolResult.error_result("Tool args must be an object")
        tool_args = copy.deepcopy(args)

        # Execute tool (handle both sync and async)
        try:
            if asyncio.iscoroutinefunction(tool):
                result = await tool(tool_args)
            else:
                result = tool(tool_args)

            if isinstance(result, ToolResult):
                return result
            return ToolResult.error_result("Tool returned invalid result format")
        except Exception as e:
            logger.error(f"Tool execution failed: {e}", exc_info=True)
            return ToolResult.error_result(f"Tool execution failed: {str(e)}")
