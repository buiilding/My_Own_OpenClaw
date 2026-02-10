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
    ProcessShellCommandArgs,
)

# Keep filesystem imports as they are (unless migrated)
from backend.src.tools.filesystem.schemas import (
    ReadFileArgs,
    WriteFileArgs,
    ListDirectoryArgs,
    GlobArgs,
    ReplaceArgs,
    SearchFileContentArgs,
    ReadManyFilesArgs,
)
from backend.src.tools.browser.schemas import BrowserControlArgs
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


class RemoteReplaceTool(RemoteToolBase, Tool[ReplaceArgs]):
    """
    Remote replace tool.

    Delegates execution to frontend filesystem replace tool.
    """

    name = "replace"
    description = "Replace exact text in a file. Use for surgical edits when you know the exact old_string and the desired new_string."
    args_model = ReplaceArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: ReplaceArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare replace for remote execution."""
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote replace tool call: {args.file_path}",
        )


class RemoteSearchFileContentTool(RemoteToolBase, Tool[SearchFileContentArgs]):
    """
    Remote search file content tool.

    Delegates execution to frontend filesystem search_file_content tool.
    """

    name = "search_file_content"
    description = "Search for a regex pattern in file contents under a directory (with optional include filter)."
    args_model = SearchFileContentArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: SearchFileContentArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare search_file_content for remote execution."""
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote search_file_content tool call: {args.pattern}",
        )


class RemoteReadManyFilesTool(RemoteToolBase, Tool[ReadManyFilesArgs]):
    """
    Remote read many files tool.

    Delegates execution to frontend filesystem read_many_files tool.
    """

    name = "read_many_files"
    description = "Read multiple files/directories/globs and return concatenated content with per-file separators."
    args_model = ReadManyFilesArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: ReadManyFilesArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare read_many_files for remote execution."""
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote read_many_files tool call: {len(args.paths)} path(s)",
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
        "  Does not wait for output or completion.\n"
        "- Yield (yield_after_seconds): Returns early if the command runs longer than the yield time; "
        "  the command continues in the background and can be managed with the process tool.\n\n"
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


class RemoteProcessTool(RemoteToolBase, Tool[ProcessShellCommandArgs]):
    """
    Remote process tool.

    Manages background shell sessions on the frontend.
    """

    name = "process"
    description = (
        "Manage background shell command sessions: list, poll, log, write, send-keys, submit, paste, kill, clear, remove."
    )
    args_model = ProcessShellCommandArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(self, args: ProcessShellCommandArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare process tool call for remote execution."""
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote process tool call: {args.action}",
        )


class RemoteBrowserTool(RemoteToolBase, Tool[BrowserControlArgs]):
    """
    Remote browser control tool.

    Controls a web browser for online tasks. Supports two modes:

    **User Chrome Mode (user_chrome):**
    - Connects to user's existing Chrome browser
    - Requires Chrome to be started with --remote-debugging-port=9222
    - Shares user's cookies, logins, and extensions
    - Full access to all tabs

    **Managed Mode (managed):**
    - Launches isolated Chromium instance
    - Clean profile, no cookies or logins
    - Safe for automation without affecting user's browser
    - Headless option available

    **Actions:**
    - `connect`: Initialize browser connection
    - `navigate`: Go to URL
    - `snapshot`: Get page overview with element refs (e.g., [1] button "Submit")
    - `click`: Click element by ref
    - `type`: Type text into input
    - `press`: Press keyboard key (Enter, Escape, etc.)
    - `scroll`: Scroll page
    - `screenshot`: Capture screenshot
    - `wait`: Wait for load state or time
    - `get_tabs`: List open tabs
    - `switch_tab`: Switch to specific tab
    - `evaluate`: Execute JavaScript
    - `close`: Close browser connection

    **Usage Workflow:**
    1. Start with `action="connect"` and `mode="user_chrome"` or `mode="managed"`
    2. Use `action="navigate"` to go to a URL
    3. Use `action="snapshot"` to see the page with numbered element refs
    4. Interact using refs: `action="click" ref="5"` or `action="type" ref="3" text="Hello"`
    5. End with `action="close"` to cleanup

    **Example:**
    ```
    # Connect to user's Chrome
    browser_control(action="connect", mode="user_chrome")

    # Navigate to a website
    browser_control(action="navigate", url="https://example.com")

    # Get page snapshot
    browser_control(action="snapshot")
    # Returns: [1] button "Sign In", [2] input "Username"...

    # Click element
    browser_control(action="click", ref="1")

    # Type text
    browser_control(action="type", ref="2", text="myusername")

    # Close when done
    browser_control(action="close")
    ```
    """

    name = "browser_control"
    description = """Control a web browser for online tasks.

Two modes available:
- 'user_chrome': Connect to your existing Chrome (must start with --remote-debugging-port=9222)
- 'managed': Launch isolated Chromium instance (clean profile, no logins)

Workflow:
1. Connect: browser_control(action="connect", mode="user_chrome")
2. Navigate: browser_control(action="navigate", url="https://example.com")
3. Snapshot: browser_control(action="snapshot") - shows page with numbered refs like [1] button
4. Interact: browser_control(action="click", ref="1") or browser_control(action="type", ref="2", text="hello")
5. Close: browser_control(action="close")

Actions:
- connect: Initialize browser (requires mode)
- navigate: Go to URL (requires url)
- snapshot: Get page overview with element refs
- click: Click element (requires ref from snapshot)
- type: Type text (requires ref, text)
- press: Press key like Enter/Escape (requires key)
- scroll: Scroll page (direction: up/down/left/right)
- screenshot: Capture screenshot (optional full_page)
- wait: Wait for load or time
- get_tabs: List open tabs
- switch_tab: Switch to tab (requires target_id)
- evaluate: Run JavaScript (requires script)
- close: Close browser connection"""

    args_model = BrowserControlArgs
    category = ToolDomain.BROWSER

    async def execute_remote(self, args: BrowserControlArgs, ctx: ToolContext) -> Any:
        """Prepare browser control for remote execution."""
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote browser tool call: {args.action}",
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
    "process": RemoteProcessTool,
    "read_file": RemoteReadFileTool,
    "write_file": RemoteWriteFileTool,
    "list_directory": RemoteListDirectoryTool,
    "glob": RemoteGlobTool,
    "replace": RemoteReplaceTool,
    "search_file_content": RemoteSearchFileContentTool,
    "read_many_files": RemoteReadManyFilesTool,
    "browser_control": RemoteBrowserTool,
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
