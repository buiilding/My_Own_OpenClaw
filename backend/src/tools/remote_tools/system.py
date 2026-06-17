"""
Remote system-domain tool stubs.
"""

from __future__ import annotations

from backend.src.core.security.policy import Permission
from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult
from backend.src.tools.system.schemas import (
    GetSystemStatsArgs,
    OpenAppArgs,
    ProcessShellCommandArgs,
    RunShellCommandArgs,
)


class RemoteGetSystemStatsTool(RemoteToolBase, Tool[GetSystemStatsArgs]):
    name = "get_system_stats"
    description = (
        "Returns current system resource usage (CPU %, Memory %, Battery). "
        "Use this to check system performance before running resource-intensive operations."
    )
    args_model = GetSystemStatsArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(
        self, args: GetSystemStatsArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args, ctx, log_message="Remote get system stats tool call"
        )


class RemoteShellTool(RemoteToolBase, Tool[RunShellCommandArgs]):
    name = "run_shell_command"
    description = (
        "This tool executes shell commands on the local system. "
        "Commands are executed in the specified directory (or the user-selected workspace folder "
        "when configured, otherwise the OS user home directory if not specified).\n\n"
        "Execution Modes:\n"
        "- Foreground (run_in_background=False): Blocks until command completion and returns output. "
        "Use terminate_after_seconds to set a timeout (default 120 seconds). If timeout is reached, "
        "the command is terminated and current output is returned.\n"
        "- Background (run_in_background=True): Starts the command and returns immediately with execution confirmation. "
        "Does not block for output or completion.\n"
        "- Yield (yield_after_seconds): Returns early if the command runs longer than the yield time; "
        "the command continues in the background and can be managed through the returned session.\n\n"
        "Operational Guidance:\n"
        "- Prefer short commands focused on one step per tool call.\n"
        "- Do not embed large inline file content (HTML/JSON/source blobs) directly in shell command arguments.\n"
        "- For creating or updating file contents, prefer dedicated file-edit capabilities before running shell commands.\n"
        "- Split large workflows into multiple tool calls rather than one giant command payload.\n"
        "- For detached GUI app launches, prefer the dedicated app-launch capability when appropriate.\n"
        "- For shell jobs you need to poll or terminate, keep run_in_background=True and manage through the returned session.\n"
        "- After launch, capture a delayed screen image when visual verification matters.\n"
        "- Use exact known window titles and deterministic focus checks when window targeting matters.\n\n"
        "Optional post-execution delay: when provided, the tool pauses for that many seconds and captures a screen image "
        "after execution. This is useful when the command opens a GUI application "
        "or makes visual changes that need to be captured.\n\n"
        "Returns: Command output, exit code, execution time, and any errors."
    )
    args_model = RunShellCommandArgs
    category = ToolDomain.SYSTEM
    required_permissions = {Permission.EXECUTE_COMMANDS}

    async def execute_remote(
        self, args: RunShellCommandArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote shell tool call: {args.command}",
        )


class RemoteOpenAppTool(RemoteToolBase, Tool[OpenAppArgs]):
    name = "open_app"
    description = (
        "Launch a GUI app detached from sidecar/agent lifecycle so the app remains running even if "
        "the current agent turn or sidecar process ends.\n\n"
        "Verification modes:\n"
        "- window (default): polls open windows for expected title.\n"
        "- screenshot: captures visual proof after launch and returns capture artifact fields.\n"
        "- none: fastest acknowledgment without verification.\n\n"
        "Use this for open-and-leave-running app workflows."
    )
    args_model = OpenAppArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(
        self, args: OpenAppArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote open app tool call: {args.command}",
        )


class RemoteProcessTool(RemoteToolBase, Tool[ProcessShellCommandArgs]):
    name = "process"
    description = (
        "Manage background shell command sessions: "
        "list, poll, log, write, send-keys, submit, paste, kill, clear, remove."
    )
    args_model = ProcessShellCommandArgs
    category = ToolDomain.SYSTEM
    required_permissions = {Permission.EXECUTE_COMMANDS}

    async def execute_remote(
        self, args: ProcessShellCommandArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote process tool call: {args.action}",
        )
