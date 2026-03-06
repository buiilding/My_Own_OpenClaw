"""
Remote system-domain tool stubs.
"""

from __future__ import annotations

from typing import Any, Type

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.filesystem.schemas import ReadFileArgs, ReplaceArgs
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult
from backend.src.tools.system.schemas import (
    GetOpenWindowsArgs,
    GetSystemStatsArgs,
    OpenAppArgs,
    ProcessShellCommandArgs,
    RunShellCommandArgs,
    SystemUseArgs,
)

_SYSTEM_USE_MODEL_BY_TOOL: dict[str, Type[Any]] = {
    "run_shell_command": RunShellCommandArgs,
    "replace": ReplaceArgs,
    "replace_file": ReplaceArgs,
    "read_file": ReadFileArgs,
    "get_system_stats": GetSystemStatsArgs,
    "get_open_windows": GetOpenWindowsArgs,
}

_SYSTEM_USE_TARGET_TOOL_BY_TOOL: dict[str, str] = {
    "run_shell_command": "run_shell_command",
    "replace": "replace",
    "replace_file": "replace",
    "read_file": "read_file",
    "get_system_stats": "get_system_stats",
    "get_open_windows": "get_open_windows",
}


class RemoteSystemUseTool(RemoteToolBase, Tool[SystemUseArgs]):
    name = "system_use"
    description = (
        "Unified system/filesystem tool. Select concrete action via `tool` and pass "
        "action arguments via `arguments`. Supports: run_shell_command, replace "
        "(or replace_file alias), read_file, get_system_stats, get_open_windows."
    )
    args_model = SystemUseArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(self, args: SystemUseArgs, ctx: ToolContext) -> RemoteToolResult:
        tool_name = args.tool
        model = _SYSTEM_USE_MODEL_BY_TOOL[tool_name]
        target_tool_name = _SYSTEM_USE_TARGET_TOOL_BY_TOOL[tool_name]
        validated_args = model.model_validate(args.arguments)
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name=target_tool_name,
            args=validated_args.model_dump(),
            request_id=request_id,
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
        "Commands are executed in the specified directory (or OS user home directory if not specified).\n\n"
        "Execution Modes:\n"
        "- Foreground (run_in_background=False): Waits for command completion and returns output. "
        "Use terminate_after_seconds to set a timeout (default 120 seconds). If timeout is reached, "
        "the command is terminated and current output is returned. Foreground llm_content is truncated by "
        "default to about 10,000 tokens; override with max_output_tokens.\n"
        "- Background (run_in_background=True): Starts the command and returns immediately with execution confirmation. "
        "Does not wait for output or completion.\n"
        "- Yield (yield_after_seconds): Returns early if the command runs longer than the yield time; "
        "the command continues in the background and can be managed with the process tool.\n\n"
        "Operational Guidance:\n"
        "- Prefer short commands focused on one step per tool call.\n"
        "- Do not embed large inline file content (HTML/JSON/source blobs) directly in shell command arguments.\n"
        "- For creating/updating file contents, use file-edit tools first (read_file + replace) and then run shell commands.\n"
        "- Split large workflows into multiple tool calls rather than one giant command payload.\n"
        "- For detached GUI app launches, prefer open_app instead of run_shell_command.\n"
        "- For shell jobs you need to poll/terminate, keep run_in_background=True and manage via process tool.\n"
        "- After launch, capture a screenshot with wait to verify expected UI state.\n"
        "- Use get_open_windows + switch_tab for deterministic window focus.\n\n"
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


class RemoteOpenAppTool(RemoteToolBase, Tool[OpenAppArgs]):
    name = "open_app"
    description = (
        "Launch a GUI app detached from sidecar/agent lifecycle so the app remains running even if "
        "the current agent turn or sidecar process ends.\n\n"
        "Verification modes:\n"
        "- window (default): polls open windows for expected title.\n"
        "- screenshot: captures visual proof after launch and returns screenshot artifact fields.\n"
        "- none: fastest acknowledgment without verification.\n\n"
        "Use this instead of run_shell_command for open-and-leave-running app workflows."
    )
    args_model = OpenAppArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(self, args: OpenAppArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote open app tool call: {args.command}",
        )


class RemoteProcessTool(RemoteToolBase, Tool[ProcessShellCommandArgs]):
    name = "process"
    description = (
        "Manage background shell command sessions started by run_shell_command: "
        "list, poll, log, write, send-keys, submit, paste, kill, clear, remove."
    )
    args_model = ProcessShellCommandArgs
    category = ToolDomain.SYSTEM

    async def execute_remote(self, args: ProcessShellCommandArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote process tool call: {args.action}",
        )
