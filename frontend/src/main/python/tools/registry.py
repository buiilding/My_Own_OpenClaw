"""
Tool Registry for Local Backend.

Registers and executes all available tools.
"""

import logging
from typing import Any, Callable, Dict

from tools.result import ToolResult
logger = logging.getLogger(__name__)

# Tools in this set are advertised by backend remote schema generation and may be
# called by the LLM. Keep this list in sync with backend/src/tools/remote.py.
EXPOSED_TO_BACKEND_TOOLS = frozenset({
    "mouse_control",
    "keyboard_control",
    "screenshot",
    "scroll_control",
    "switch_tab",
    "wait",
    "get_open_windows",
    "get_system_stats",
    "run_shell_command",
    "process",
    "read_file",
    "replace",
    "browser_control",
})


class ToolRegistry:
    """
    Registry for all available tools.
    
    Handles tool registration and execution.
    """
    
    def __init__(self):
        self.tools: Dict[str, Callable[..., Any]] = {}
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
            from tools.browser.browser_tool import execute_browser_control
            self.tools["browser_control"] = execute_browser_control
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

        tool_args = args if isinstance(args, dict) else {}
        
        # Execute tool (handle both sync and async)
        try:
            import asyncio

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
                    return ToolResult.error_result(result.get("error", "Tool execution failed"))
                else:
                    return ToolResult.success_result(result.get("data", result))
            else:
                return ToolResult.error_result("Tool returned invalid result format")
        except Exception as e:
            logger.error(f"Tool execution failed: {e}", exc_info=True)
            return ToolResult.error_result(f"Tool execution failed: {str(e)}")
