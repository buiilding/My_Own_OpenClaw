"""
Tool Registry for Local Backend.

Registers and executes all available tools with Pydantic validation.
"""

import logging
from typing import Any, Dict, Type
from pydantic import BaseModel, ValidationError

from tools.result import ToolResult
from tools.schemas import (
    MouseControlArgs,
    KeyboardControlArgs,
    ScreenshotToolArgs,
    ScrollControlArgs,
    ReadFileArgs,
    WriteFileArgs,
    ListDirectoryArgs,
    RunShellCommandArgs,
    SwitchTabArgs,
    GetOpenWindowsArgs,
    GetSystemStatsArgs,
    WaitToolArgs,
    ReplaceArgs,
    SearchFileContentArgs,
    GlobArgs,
    ReadManyFilesArgs,
)

logger = logging.getLogger(__name__)

# Map tool names to their Pydantic schema classes
TOOL_SCHEMAS: Dict[str, Type[BaseModel]] = {
    "mouse_control": MouseControlArgs,
    "keyboard_control": KeyboardControlArgs,
    "screenshot": ScreenshotToolArgs,
    "scroll_control": ScrollControlArgs,
    "read_file": ReadFileArgs,
    "write_file": WriteFileArgs,
    "list_directory": ListDirectoryArgs,
    "replace": ReplaceArgs,
    "search_file_content": SearchFileContentArgs,
    "glob": GlobArgs,
    "read_many_files": ReadManyFilesArgs,
    "run_shell_command": RunShellCommandArgs,
    "switch_tab": SwitchTabArgs,
    "get_open_windows": GetOpenWindowsArgs,
    "get_system_stats": GetSystemStatsArgs,
    "wait": WaitToolArgs,
}


class ToolRegistry:
    """
    Registry for all available tools.
    
    Handles tool registration and execution.
    """
    
    def __init__(self):
        self.tools: Dict[str, callable] = {}
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
            from tools.filesystem.write_file_tool import write_file
            self.tools["write_file"] = write_file
        except ImportError as e:
            logger.warning(f"Failed to import write_file_tool: {e}")
        
        try:
            from tools.filesystem.list_directory_tool import list_directory
            self.tools["list_directory"] = list_directory
        except ImportError as e:
            logger.warning(f"Failed to import list_directory_tool: {e}")
        
        try:
            from tools.filesystem.replace_tool import replace
            self.tools["replace"] = replace
        except ImportError as e:
            logger.warning(f"Failed to import replace_tool: {e}")
        
        try:
            from tools.filesystem.search_file_content_tool import search_file_content
            self.tools["search_file_content"] = search_file_content
        except ImportError as e:
            logger.warning(f"Failed to import search_file_content_tool: {e}")
        
        try:
            from tools.filesystem.glob_tool import glob
            self.tools["glob"] = glob
        except ImportError as e:
            logger.warning(f"Failed to import glob_tool: {e}")
        
        try:
            from tools.filesystem.read_many_files_tool import read_many_files
            self.tools["read_many_files"] = read_many_files
        except ImportError as e:
            logger.warning(f"Failed to import read_many_files_tool: {e}")
        
        # System tools
        try:
            from tools.system.shell_tool import run_shell_command
            self.tools["run_shell_command"] = run_shell_command
        except ImportError as e:
            logger.warning(f"Failed to import shell_tool: {e}")
        
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
        
        logger.debug(f"Registered {len(self.tools)} tools: {', '.join(self.tools.keys())}")
    
    async def execute_tool(self, tool_name: str, args: Dict[str, Any]) -> ToolResult:
        """
        Execute a tool with Pydantic validation.
        
        Args:
            tool_name: Name of the tool
            args: Tool arguments (raw dictionary)
            
        Returns:
            ToolResult object with standardized structure
        """
        tool = self.tools.get(tool_name)
        if not tool:
            return ToolResult.error_result(f"Tool not found: {tool_name}")
        
        # Validate arguments using Pydantic
        schema_class = TOOL_SCHEMAS.get(tool_name)
        validated_args = None
        if schema_class:
            try:
                validated_args = schema_class(**args)
            except ValidationError as e:
                # Safely extract error messages from Pydantic validation errors
                error_messages = []
                for err in e.errors():
                    loc = err.get('loc', ())
                    msg = err.get('msg', 'Validation error')
                    # Handle both tuple and list locations, and empty locations
                    if loc:
                        if isinstance(loc, (tuple, list)) and len(loc) > 0:
                            field_name = '.'.join(str(x) for x in loc)
                        else:
                            field_name = str(loc)
                        error_messages.append(f"{field_name}: {msg}")
                    else:
                        error_messages.append(msg)
                error_msg = "; ".join(error_messages) if error_messages else "Validation error"
                return ToolResult.error_result(f"Invalid arguments: {error_msg}")
            except Exception as e:
                return ToolResult.error_result(f"Argument validation failed: {str(e)}")
        
        # Execute tool (handle both sync and async)
        try:
            import asyncio
            import inspect
            
            # Determine what format the tool expects
            # New tools (replace, search_file_content, glob, read_many_files) accept Pydantic models
            # Legacy tools (read_file, write_file, list_directory) accept dicts
            tools_accepting_models = {"replace", "search_file_content", "glob", "read_many_files"}
            
            if tool_name in tools_accepting_models and validated_args:
                # Pass Pydantic model directly
                tool_args = validated_args
            elif validated_args:
                # Convert to dict for legacy tools
                tool_args = validated_args.model_dump()
            else:
                # No validation, pass as-is
                tool_args = args
            
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
