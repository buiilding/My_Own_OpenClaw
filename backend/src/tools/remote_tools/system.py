"""
Remote system-domain tool stubs.
"""

from __future__ import annotations

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult
from backend.src.tools.system.schemas import (
    GetSystemStatsArgs,
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

    async def execute_remote(self, args: GetSystemStatsArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(args, ctx, log_message="Remote get system stats tool call")


class RemoteShellTool(RemoteToolBase, Tool[RunShellCommandArgs]):
    name = "run_shell_command"
    description = (
        "This tool executes shell commands on the local system. "
        "Commands are executed in the specified directory (or current directory if not specified).\n\n"
        "Execution Modes:\n"
        "- Foreground (run_in_background=False): Waits for command completion and returns output. "
        "Use terminate_after_seconds to set a timeout (default 120 seconds). If timeout is reached, "
        "the command is terminated and current output is returned.\n"
        "- Background (run_in_background=True): Starts the command and returns immediately with execution confirmation. "
        "Does not wait for output or completion.\n"
        "- Yield (yield_after_seconds): Returns early if the command runs longer than the yield time; "
        "the command continues in the background and can be managed with the process tool.\n\n"
        "Optional wait parameter: If 'wait' is provided (in seconds), the tool will wait and capture a screenshot "
        "after execution, similar to computer-use tools. This is useful when the command opens a GUI application "
        "or makes visual changes that need to be captured.\n\n"
        "Returns: Command output, exit code, execution time, and any errors."
    )
    args_model = RunShellCommandArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(self, args: RunShellCommandArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote shell tool call: {args.command}",
        )


class RemoteProcessTool(RemoteToolBase, Tool[ProcessShellCommandArgs]):
    name = "process"
    description = (
        "Manage background shell command sessions: list, poll, log, write, "
        "send-keys, submit, paste, kill, clear, remove."
    )
    args_model = ProcessShellCommandArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(self, args: ProcessShellCommandArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote process tool call: {args.action}",
        )
