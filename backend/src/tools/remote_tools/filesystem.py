"""
Remote filesystem-domain tool stubs.
"""

from __future__ import annotations

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.filesystem.schemas import (
    ReadFileArgs,
    ReplaceArgs,
)
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult


class RemoteReadFileTool(RemoteToolBase, Tool[ReadFileArgs]):
    name = "read_file"
    description = "Read file contents. Use this tool to examine existing files."
    args_model = ReadFileArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: ReadFileArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote read file tool call: {args.file_path}",
        )


class RemoteReplaceTool(RemoteToolBase, Tool[ReplaceArgs]):
    name = "replace"
    description = (
        "Replace text in a file using exact or context-anchored matching. Supports "
        "single edits and batched replacements."
    )
    args_model = ReplaceArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: ReplaceArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote replace tool call: {args.file_path}",
        )
