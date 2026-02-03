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

    def _build_remote_result(
        self,
        args: Any,
        ctx: ToolContext,
        log_message: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> RemoteToolResult:
        if request_id is None:
            request_id = self._get_request_id(ctx)
        args_dict = args.model_dump()
        if log_message:
            logger.debug(log_message)
        return RemoteToolResult(
            tool_name=self.name,
            args=args_dict,
            request_id=request_id,
        )


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
    ListDirectoryArgs,
    GlobArgs,
)
# from backend.src.tools.filesystem.read_file_tool_sdk import ReadFileArgs, ReadFileToolSDK as BackendReadFileTool
# from backend.src.tools.filesystem.write_file_tool import WriteFileArgs, WriteFileTool as BackendWriteFileTool
# from backend.src.tools.filesystem.list_directory_tool import ListDirectoryArgs, ListDirectoryTool as BackendListDirectoryTool


class RemoteMouseTool(RemoteToolBase, Tool[MouseControlArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote mouse tool call: {args.action} at ({args.x}, {args.y})",
        )


class RemoteKeyboardTool(RemoteToolBase, Tool[KeyboardControlArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote keyboard tool call: {args.action}",
        )


class RemoteScreenshotTool(RemoteToolBase, Tool[ScreenshotToolArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            log_message="Remote screenshot tool call",
        )


class RemoteReadFileTool(RemoteToolBase, Tool[ReadFileArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote read file tool call: {args.file_path}",
        )


class RemoteWriteFileTool(RemoteToolBase, Tool[WriteFileArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote write file tool call: {args.file_path}",
        )


class RemoteListDirectoryTool(RemoteToolBase, Tool[ListDirectoryArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            request_id=request_id,
            log_message=f"Remote list directory tool call: {args.path}",
        )


class RemoteGlobTool(RemoteToolBase, Tool[GlobArgs]):
    """
    Remote glob tool.

    Delegates execution to frontend file system tool.
    """

    name = "glob"
    description = "Find files matching glob patterns."
    args_model = GlobArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: GlobArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare glob search for remote execution."""
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote glob tool call: {args.pattern}",
        )


class RemoteScrollTool(RemoteToolBase, Tool[ScrollControlArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote scroll tool call: {args.action}",
        )


class RemoteSwitchTabTool(RemoteToolBase, Tool[SwitchTabArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote switch tab tool call: {args.tab_name}",
        )


class RemoteWaitTool(RemoteToolBase, Tool[WaitToolArgs]):
    """
    Remote wait tool.

    Delegates execution to frontend wait tool.
    """

    name = "wait"
    description = (
        "Wait for a specified number of seconds, then capture a screenshot of the current screen state. "
        "Useful for waiting for UI changes, animations, page loads, or async operations to complete. "
        "After execution, returns a status message and a screenshot image."
    )
    args_model = WaitToolArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: WaitToolArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare wait for remote execution."""
        import uuid
        request_id = str(uuid.uuid4())
        return self._build_remote_result(
            args,
            ctx,
            request_id=request_id,
            log_message="Remote wait tool call",
        )


class RemoteGetOpenWindowsTool(RemoteToolBase, Tool[GetOpenWindowsArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            log_message="Remote get open windows tool call",
        )


class RemoteGetSystemStatsTool(RemoteToolBase, Tool[GetSystemStatsArgs]):
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
        return self._build_remote_result(
            args,
            ctx,
            log_message="Remote get system stats tool call",
        )


class RemoteShellTool(RemoteToolBase, Tool[RunShellCommandArgs]):
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
        "Optional wait parameter: If 'wait' is provided (in seconds), the tool will wait and capture a screenshot "
        "after execution, similar to computer-use tools. This is useful when the command opens a GUI application "
        "or makes visual changes that need to be captured.\n\n"
        "Returns: Command output, exit code, execution time, and any errors."
    )
    args_model = RunShellCommandArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(self, args: RunShellCommandArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare shell command for remote execution."""
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote shell tool call: {args.command}",
        )


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
    "glob": RemoteGlobTool,
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
