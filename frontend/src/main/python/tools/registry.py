"""
Tool Registry for Local Backend.

Registers and executes all available tools.
"""

import asyncio
import copy
from importlib import import_module
import logging
from typing import Any, Callable, Dict

from tools.exposed_tool_names import EXPOSED_TO_BACKEND_TOOL_NAMES
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
        self._register_tools()

    def has_tool(self, tool_name: str) -> bool:
        return tool_name in self.tools

    def reload_tools(self) -> None:
        self.tools.clear()
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

            self.tools["switch_tab"] = switch_to_window
            self.tools["get_open_windows"] = get_open_windows
        except ImportError as e:
            logger.warning(f"Failed to import window_tool: {e}")

        missing_exposed_tools = EXPOSED_TO_BACKEND_TOOL_NAMES - set(self.tools.keys())
        if missing_exposed_tools:
            logger.warning(
                "Tools expected by backend schemas are unavailable in sidecar runtime: %s",
                ", ".join(sorted(missing_exposed_tools)),
            )

        logger.debug(
            f"Registered {len(self.tools)} tools: {', '.join(self.tools.keys())}"
        )

    @staticmethod
    def get_exposed_tool_names() -> set[str]:
        """Return sidecar tools that are expected to be exposed by backend schemas."""
        return set(EXPOSED_TO_BACKEND_TOOL_NAMES)

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

    @staticmethod
    def _extract_failure_payload(
        result: Dict[str, Any]
    ) -> tuple[str, Dict[str, Any] | None]:
        """Extract the most useful failure message from legacy dict tool results."""
        data = result.get("data")
        payload_data = data if isinstance(data, dict) else None

        top_level_error = result.get("error")
        if isinstance(top_level_error, str) and top_level_error.strip():
            return top_level_error.strip(), payload_data

        if isinstance(data, str) and data.strip():
            return data.strip(), payload_data

        if payload_data:
            for key in ("error", "return_display", "llm_content", "output", "message"):
                value = payload_data.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip(), payload_data

            exit_code = payload_data.get("exit_code")
            if isinstance(exit_code, int):
                return f"Tool execution failed with exit code {exit_code}", payload_data

        return "Tool execution failed", payload_data

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

            # Convert result to ToolResult if needed
            if isinstance(result, ToolResult):
                return result
            elif isinstance(result, dict):
                # Handle legacy dict format
                if result.get("success") is False:
                    error_message, failure_data = self._extract_failure_payload(result)
                    return ToolResult(
                        success=False, error=error_message, data=failure_data
                    )
                else:
                    return ToolResult.success_result(result.get("data", result))
            else:
                return ToolResult.error_result("Tool returned invalid result format")
        except Exception as e:
            logger.error(f"Tool execution failed: {e}", exc_info=True)
            return ToolResult.error_result(f"Tool execution failed: {str(e)}")
