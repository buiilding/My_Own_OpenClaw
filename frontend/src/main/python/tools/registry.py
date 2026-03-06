"""
Tool Registry for Local Backend.

Registers and executes all available tools.
"""

import asyncio
import copy
from importlib import import_module
import logging
from typing import Any, Callable, Dict

from tools.result import ToolResult
logger = logging.getLogger(__name__)

# Tools in this set are advertised by backend remote schema generation and may be
# called by the LLM. Keep this list in sync with backend/src/tools/remote.py.
EXPOSED_TO_BACKEND_TOOLS = frozenset({
    "computer_use",
    "system_use",
    "mouse_control",
    "keyboard_control",
    "screenshot",
    "scroll_control",
    "switch_tab",
    "wait",
    "get_open_windows",
    "get_system_stats",
    "open_app",
    "run_shell_command",
    "process",
    "read_file",
    "replace",
    "browser",
})

COMPUTER_USE_SUBTOOLS = frozenset({
    "mouse_control",
    "keyboard_control",
    "screenshot",
    "scroll_control",
    "switch_tab",
    "wait",
})
COMPUTER_USE_REQUIRED_METADATA_FIELDS = (
    "description",
    "explanation",
    "expectation",
)
SYSTEM_USE_SUBTOOLS = frozenset({
    "run_shell_command",
    "replace",
    "replace_file",
    "read_file",
    "get_system_stats",
    "get_open_windows",
})
SYSTEM_USE_TOOL_NAME_TO_EXECUTOR = {
    "run_shell_command": "run_shell_command",
    "replace": "replace",
    "replace_file": "replace",
    "read_file": "read_file",
    "get_system_stats": "get_system_stats",
    "get_open_windows": "get_open_windows",
}


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
        # Computer tools
        try:
            from tools.computer.mouse_tool import execute_mouse_control
            self.tools["mouse_control"] = execute_mouse_control
        except ImportError as e:
            logger.warning(f"Failed to import mouse_tool: {e}")
        
        try:
            from tools.computer.keyboard_tool import execute_keyboard_control
            self.tools["keyboard_control"] = execute_keyboard_control
        except ImportError as e:
            logger.warning(f"Failed to import keyboard_tool: {e}")
        
        try:
            from tools.computer.screenshot_tool import capture_screenshot
            self.tools["screenshot"] = capture_screenshot
        except ImportError as e:
            logger.warning(f"Failed to import screenshot_tool: {e}")
        
        try:
            from tools.computer.scroll_tool import execute_scroll_control
            self.tools["scroll_control"] = execute_scroll_control
        except ImportError as e:
            logger.warning(f"Failed to import scroll_tool: {e}")

        async def execute_computer_use(args: Dict[str, Any]) -> ToolResult:
            """
            Unified computer-use router.

            Accepts `{tool, arguments, metadata}` and delegates to the selected
            concrete sidecar tool so backend/sidecar exposed-tool sets stay in
            sync while execution remains lightweight in the sidecar.
            """
            if not isinstance(args, dict):
                return ToolResult.error_result("Tool args must be an object")

            raw_tool_name = args.get("tool")
            tool_name = raw_tool_name.strip() if isinstance(raw_tool_name, str) else None
            if not tool_name or tool_name not in COMPUTER_USE_SUBTOOLS:
                return ToolResult.error_result(
                    "computer_use requires a valid 'tool' value "
                    f"({', '.join(sorted(COMPUTER_USE_SUBTOOLS))})"
                )
            args["tool"] = tool_name

            tool_arguments = args.get("arguments", {})
            if not isinstance(tool_arguments, dict):
                return ToolResult.error_result("computer_use.arguments must be an object")
            tool_arguments = copy.deepcopy(tool_arguments)

            metadata = args.get("metadata")
            if not isinstance(metadata, dict):
                return ToolResult.error_result("computer_use.metadata must be an object")

            normalized_metadata: Dict[str, str] = {}
            for field_name in COMPUTER_USE_REQUIRED_METADATA_FIELDS:
                raw_value = metadata.get(field_name)
                if not isinstance(raw_value, str) or not raw_value.strip():
                    return ToolResult.error_result(
                        f"computer_use missing required metadata field: {field_name}"
                    )
                normalized_metadata[field_name] = raw_value.strip()
            unexpected_metadata_fields = sorted(
                key
                for key in metadata.keys()
                if key not in COMPUTER_USE_REQUIRED_METADATA_FIELDS
            )
            if unexpected_metadata_fields:
                return ToolResult.error_result(
                    "computer_use.metadata contains unexpected fields: "
                    f"{', '.join(unexpected_metadata_fields)}"
                )
            args["metadata"] = normalized_metadata

            return await self.execute_tool(tool_name, tool_arguments)

        self.tools["computer_use"] = execute_computer_use

        async def execute_system_use(args: Dict[str, Any]) -> ToolResult:
            """
            Unified system/filesystem router.

            Accepts `{tool, arguments}` and delegates to the selected concrete
            sidecar tool. `replace_file` is treated as an alias of `replace`.
            """
            if not isinstance(args, dict):
                return ToolResult.error_result("Tool args must be an object")

            raw_tool_name = args.get("tool")
            tool_name = raw_tool_name.strip() if isinstance(raw_tool_name, str) else None
            if not tool_name or tool_name not in SYSTEM_USE_SUBTOOLS:
                return ToolResult.error_result(
                    "system_use requires a valid 'tool' value "
                    f"({', '.join(sorted(SYSTEM_USE_SUBTOOLS))})"
                )
            args["tool"] = tool_name

            tool_arguments = args.get("arguments", {})
            if not isinstance(tool_arguments, dict):
                return ToolResult.error_result("system_use.arguments must be an object")
            tool_arguments = copy.deepcopy(tool_arguments)
            target_tool_name = SYSTEM_USE_TOOL_NAME_TO_EXECUTOR[tool_name]
            return await self.execute_tool(target_tool_name, tool_arguments)

        self.tools["system_use"] = execute_system_use
        
        # Filesystem tools
        try:
            from tools.filesystem.read_file_tool import read_file
            self.tools["read_file"] = read_file
        except ImportError as e:
            logger.warning(f"Failed to import read_file_tool: {e}")
        
        try:
            from tools.filesystem.replace_tool import replace
            self.tools["replace"] = replace
        except ImportError as e:
            logger.warning(f"Failed to import replace_tool: {e}")
        
        # System tools
        try:
            from tools.system.shell_tool import run_shell_command
            self.tools["run_shell_command"] = run_shell_command
        except ImportError as e:
            logger.warning(f"Failed to import shell_tool: {e}")

        try:
            from tools.system.open_app_tool import open_app
            self.tools["open_app"] = open_app
        except ImportError as e:
            logger.warning(f"Failed to import open_app_tool: {e}")

        try:
            from tools.system.process_tool import process_shell_command
            self.tools["process"] = process_shell_command
        except ImportError as e:
            logger.warning(f"Failed to import process_tool: {e}")
        
        try:
            from tools.system.window_tool import switch_to_window, get_open_windows
            self.tools["switch_tab"] = switch_to_window
            self.tools["get_open_windows"] = get_open_windows
        except ImportError as e:
            logger.warning(f"Failed to import window_tool: {e}")
        
        try:
            from tools.system.stats_tool import get_system_stats
            self.tools["get_system_stats"] = get_system_stats
        except ImportError as e:
            logger.warning(f"Failed to import stats_tool: {e}")
        
        try:
            from tools.system.wait_tool import wait
            self.tools["wait"] = wait
        except ImportError as e:
            logger.warning(f"Failed to import wait_tool: {e}")
        
        # Browser tools
        try:
            self.tools["browser"] = self._build_lazy_tool(
                module_name="tools.browser.browser_tool",
                attr_name="execute_browser",
            )
        except ImportError as e:
            logger.warning(f"Failed to import browser_tool: {e}")

        missing_exposed_tools = EXPOSED_TO_BACKEND_TOOLS - set(self.tools.keys())
        if missing_exposed_tools:
            logger.warning(
                "Tools expected by backend schemas are unavailable in sidecar runtime: %s",
                ", ".join(sorted(missing_exposed_tools)),
            )

        logger.debug(f"Registered {len(self.tools)} tools: {', '.join(self.tools.keys())}")

    @staticmethod
    def get_exposed_tool_names() -> set[str]:
        """Return sidecar tools that are expected to be exposed by backend schemas."""
        return set(EXPOSED_TO_BACKEND_TOOLS)

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
    def _extract_failure_payload(result: Dict[str, Any]) -> tuple[str, Dict[str, Any] | None]:
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
        tool_args = args
        
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
                    return ToolResult(success=False, error=error_message, data=failure_data)
                else:
                    return ToolResult.success_result(result.get("data", result))
            else:
                return ToolResult.error_result("Tool returned invalid result format")
        except Exception as e:
            logger.error(f"Tool execution failed: {e}", exc_info=True)
            return ToolResult.error_result(f"Tool execution failed: {str(e)}")
