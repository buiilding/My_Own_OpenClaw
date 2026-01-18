"""
Remote Tool Stubs for Frontend Tools

These are stub implementations of tools that actually execute on the frontend.
They provide schemas for LLM tool calling but delegate execution to the frontend
via the API response stream.
"""

import logging
from typing import Any, Dict, Optional, Type

from backend.src.core.security.policy import Permission
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.categorization import ToolDomain

logger = logging.getLogger(__name__)


class RemoteToolResult:
    """
    Result wrapper for remote tool execution.

    This indicates that the tool should be executed on the frontend,
    not locally in the backend.
    """

    def __init__(self, tool_name: str, args: Dict[str, Any], request_id: str):
        self.tool_name = tool_name
        self.args = args
        self.request_id = request_id
        self.is_remote = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format for API response."""
        return {
            "tool_name": self.tool_name,
            "args": self.args,
            "request_id": self.request_id,
            "is_remote": True
        }


class RemoteToolBase:
    """
    Base mixin for remote tools that execute on the frontend.

    Remote tools define schemas and validation but don't execute locally.
    Instead, they return RemoteToolResult objects that get forwarded
    to the frontend for execution.
    """

    # Override to not require permissions (frontend handles security)
    required_permissions: set[Permission] = set()

    def _get_request_id(self, ctx: ToolContext) -> str:
        """
        Get request_id from session metadata or generate new one.
        
        Args:
            ctx: Tool execution context
            
        Returns:
            Request ID string
        """
        # Try to get request_id from session metadata (set in interaction_loop)
        if ctx.session and ctx.session.metadata:
            request_id = ctx.session.metadata.get('request_id')
            if request_id:
                logger.debug(f"Using request_id from session metadata: {request_id}")
                return request_id
        
        # Fallback: generate new request_id
        import uuid
        request_id = str(uuid.uuid4())
        logger.debug(f"Generated new request_id: {request_id}")
        return request_id

    async def execute_remote(self, args: Any, ctx: ToolContext) -> RemoteToolResult:
        """
        Prepare the tool call for remote execution.

        Args:
            args: Validated arguments
            ctx: Execution context

        Returns:
            RemoteToolResult to be forwarded to frontend
        """
        raise NotImplementedError("Subclasses must implement execute_remote")

    async def run(self, args: Any, ctx: ToolContext) -> RemoteToolResult:
        """
        Main execution method - returns remote execution result.

        Args:
            args: Validated arguments
            ctx: Execution context

        Returns:
            RemoteToolResult for frontend execution
        """
        return await self.execute_remote(args, ctx)


# Import schemas from the new location
from backend.src.tools.computer.schemas import (
    MouseControlArgs,
    KeyboardControlArgs,
    ScreenshotToolArgs,
    ScrollControlArgs,
    SwitchTabArgs,
    WaitToolArgs,
)
from backend.src.tools.system.schemas import (
    GetOpenWindowsArgs,
    GetSystemStatsArgs,
    RunShellCommandArgs,
)

# Keep filesystem imports as they are (unless migrated)
from backend.src.tools.filesystem.schemas import (
    ReadFileArgs,
    WriteFileArgs,
    ListDirectoryArgs
)
# from backend.src.tools.filesystem.read_file_tool_sdk import ReadFileArgs, ReadFileToolSDK as BackendReadFileTool
# from backend.src.tools.filesystem.write_file_tool import WriteFileArgs, WriteFileTool as BackendWriteFileTool
# from backend.src.tools.filesystem.list_directory_tool import ListDirectoryArgs, ListDirectoryTool as BackendListDirectoryTool


class RemoteMouseTool(Tool[MouseControlArgs], RemoteToolBase):
    """
    Remote mouse control tool.

    Delegates execution to frontend mouse tool.
    """

    name = "mouse_control"
    description = "Control mouse actions with manual coordinates. Supports clicking, double-clicking, right-clicking, moving, dragging, and scrolling."
    args_model = MouseControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: MouseControlArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare mouse control for remote execution."""
        request_id = self._get_request_id(ctx)

        # Convert args to dict for frontend
        args_dict = args.model_dump()

        logger.debug(f"Remote mouse tool call: {args.action} at ({args.x}, {args.y})")

        return RemoteToolResult(
            tool_name="mouse_control",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: MouseControlArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteKeyboardTool(Tool[KeyboardControlArgs], RemoteToolBase):
    """
    Remote keyboard control tool.

    Delegates execution to frontend keyboard tool.
    """

    name = "keyboard_control"
    description = "Control keyboard input including typing text, pressing keys, and keyboard shortcuts."
    args_model = KeyboardControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: KeyboardControlArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare keyboard control for remote execution."""
        request_id = self._get_request_id(ctx)

        args_dict = args.model_dump()

        logger.debug(f"Remote keyboard tool call: {args.action}")

        return RemoteToolResult(
            tool_name="keyboard_control",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: KeyboardControlArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteScreenshotTool(Tool[ScreenshotToolArgs], RemoteToolBase):
    """
    Remote screenshot tool.

    Delegates execution to frontend screenshot tool.
    """

    name = "screenshot"
    description = "Capture a screenshot of the current computer screen."
    args_model = ScreenshotToolArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: ScreenshotToolArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare screenshot for remote execution."""
        request_id = self._get_request_id(ctx)

        args_dict = args.model_dump()

        logger.debug("Remote screenshot tool call")

        return RemoteToolResult(
            tool_name="screenshot",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: ScreenshotToolArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteReadFileTool(Tool[ReadFileArgs], RemoteToolBase):
    """
    Remote read file tool.

    Delegates execution to frontend file system tool.
    """

    name = "read_file"
    description = "Read file contents. Use this tool to examine existing files."
    args_model = ReadFileArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: ReadFileArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare file read for remote execution."""
        request_id = self._get_request_id(ctx)

        args_dict = args.model_dump()

        logger.debug(f"Remote read file tool call: {args.file_path}")

        return RemoteToolResult(
            tool_name="read_file",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: ReadFileArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteWriteFileTool(Tool[WriteFileArgs], RemoteToolBase):
    """
    Remote write file tool.

    Delegates execution to frontend file system tool.
    """

    name = "write_file"
    description = "Create or overwrite files with content."
    args_model = WriteFileArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: WriteFileArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare file write for remote execution."""
        request_id = self._get_request_id(ctx)

        args_dict = args.model_dump()

        logger.debug(f"Remote write file tool call: {args.file_path}")

        return RemoteToolResult(
            tool_name="write_file",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: WriteFileArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteListDirectoryTool(Tool[ListDirectoryArgs], RemoteToolBase):
    """
    Remote list directory tool.

    Delegates execution to frontend file system tool.
    """

    name = "list_directory"
    description = "List files and directories in a path."
    args_model = ListDirectoryArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: ListDirectoryArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare directory listing for remote execution."""
        import uuid
        request_id = str(uuid.uuid4())

        args_dict = args.model_dump()

        logger.debug(f"Remote list directory tool call: {args.path}")

        return RemoteToolResult(
            tool_name="list_directory",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: ListDirectoryArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteScrollTool(Tool[ScrollControlArgs], RemoteToolBase):
    """
    Remote scroll control tool.

    Delegates execution to frontend scroll tool.
    """

    name = "scroll_control"
    description = "Control scrolling actions including up, down, left, and right scrolling."
    args_model = ScrollControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: ScrollControlArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare scroll control for remote execution."""
        request_id = self._get_request_id(ctx)

        args_dict = args.model_dump()

        logger.debug(f"Remote scroll tool call: {args.action}")

        return RemoteToolResult(
            tool_name="scroll_control",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: ScrollControlArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteSwitchTabTool(Tool[SwitchTabArgs], RemoteToolBase):
    """
    Remote switch tab tool.

    Delegates execution to frontend switch tab tool.
    """

    name = "switch_tab"
    description = "Switch focus to a specific window/tab by name. Use this to navigate between open windows or browser tabs using the exact name shown in get_open_windows."
    args_model = SwitchTabArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: SwitchTabArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare switch tab for remote execution."""
        request_id = self._get_request_id(ctx)

        args_dict = args.model_dump()

        logger.debug(f"Remote switch tab tool call: {args.tab_name}")

        return RemoteToolResult(
            tool_name="switch_tab",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: SwitchTabArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteWaitTool(Tool[WaitToolArgs], RemoteToolBase):
    """
    Remote wait tool.

    Delegates execution to frontend wait tool.
    """

    name = "wait"
    description = (
        "Wait for 1 second, then capture a screenshot of the current screen state. "
        "Useful for waiting for UI changes, animations, page loads, or async operations to complete. "
        "After execution, returns a status message and a screenshot image."
    )
    args_model = WaitToolArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: WaitToolArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare wait for remote execution."""
        import uuid
        request_id = str(uuid.uuid4())

        args_dict = args.model_dump()

        logger.debug("Remote wait tool call")

        return RemoteToolResult(
            tool_name="wait",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: WaitToolArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteGetOpenWindowsTool(Tool[GetOpenWindowsArgs], RemoteToolBase):
    """
    Remote get open windows tool.

    Delegates execution to frontend system tool.
    """

    name = "get_open_windows"
    description = "Lists all currently open window titles. Use this to check if an app is already open before launching a new instance."
    args_model = GetOpenWindowsArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: GetOpenWindowsArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare get open windows for remote execution."""
        request_id = self._get_request_id(ctx)

        args_dict = args.model_dump()

        logger.debug("Remote get open windows tool call")

        return RemoteToolResult(
            tool_name="get_open_windows",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: GetOpenWindowsArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteGetSystemStatsTool(Tool[GetSystemStatsArgs], RemoteToolBase):
    """
    Remote get system stats tool.

    Delegates execution to frontend system tool.
    """

    name = "get_system_stats"
    description = "Returns current system resource usage (CPU %, Memory %, Battery). Use this to check system performance before running resource-intensive operations."
    args_model = GetSystemStatsArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(self, args: GetSystemStatsArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare get system stats for remote execution."""
        request_id = self._get_request_id(ctx)

        args_dict = args.model_dump()

        logger.debug("Remote get system stats tool call")

        return RemoteToolResult(
            tool_name="get_system_stats",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: GetSystemStatsArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


class RemoteShellTool(Tool[RunShellCommandArgs], RemoteToolBase):
    """
    Remote shell command tool.

    Delegates execution to frontend shell tool.
    """

    name = "run_shell_command"
    description = (
        "This tool executes shell commands on the local system. "
        "Commands are executed in the specified directory (or current directory if not specified).\n\n"
        "Execution Modes:\n"
        "- Foreground (run_in_background=False): Waits for command completion and returns output. "
        "  Use terminate_after_seconds to set a timeout (default 120 seconds). If timeout is reached, "
        "  the command is terminated and current output is returned.\n"
        "- Background (run_in_background=True): Starts the command and returns immediately with execution confirmation. "
        "  Does not wait for output or completion.\n\n"
        "Returns: Command output, exit code, execution time, and any errors."
    )
    args_model = RunShellCommandArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(self, args: RunShellCommandArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare shell command for remote execution."""
        request_id = self._get_request_id(ctx)

        args_dict = args.model_dump()

        logger.debug(f"Remote shell tool call: {args.command}")

        return RemoteToolResult(
            tool_name="run_shell_command",
            args=args_dict,
            request_id=request_id
        )

    async def run(self, args: RunShellCommandArgs, ctx: ToolContext) -> RemoteToolResult:
        """Execute remote tool - delegates to execute_remote."""
        return await self.execute_remote(args, ctx)


# Registry of remote tools for easy access
REMOTE_TOOLS = {
    "mouse_control": RemoteMouseTool,
    "keyboard_control": RemoteKeyboardTool,
    "screenshot": RemoteScreenshotTool,
    "scroll_control": RemoteScrollTool,
    "switch_tab": RemoteSwitchTabTool,
    "wait": RemoteWaitTool,
    "get_open_windows": RemoteGetOpenWindowsTool,
    "get_system_stats": RemoteGetSystemStatsTool,
    "run_shell_command": RemoteShellTool,
    "read_file": RemoteReadFileTool,
    "write_file": RemoteWriteFileTool,
    "list_directory": RemoteListDirectoryTool,
}


def get_remote_tool(tool_name: str) -> Optional[Type[Tool]]:
    """
    Get a remote tool class by name.

    Args:
        tool_name: Name of the remote tool

    Returns:
        Remote tool class or None if not found
    """
    return REMOTE_TOOLS.get(tool_name)


def get_all_remote_tools() -> Dict[str, Type[Tool]]:
    """
    Get all remote tool classes.

    Returns:
        Dictionary mapping tool names to remote tool classes
    """
    return REMOTE_TOOLS.copy()