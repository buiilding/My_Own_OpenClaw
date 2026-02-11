"""
Remote filesystem-domain tool stubs.
"""

from __future__ import annotations

import uuid

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.filesystem.schemas import (
    GlobArgs,
    ListDirectoryArgs,
    ReadFileArgs,
    ReadManyFilesArgs,
    ReplaceArgs,
    SearchFileContentArgs,
    WriteFileArgs,
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


class RemoteWriteFileTool(RemoteToolBase, Tool[WriteFileArgs]):
    name = "write_file"
    description = "Create or overwrite files with content."
    args_model = WriteFileArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: WriteFileArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote write file tool call: {args.file_path}",
        )


class RemoteListDirectoryTool(RemoteToolBase, Tool[ListDirectoryArgs]):
    name = "list_directory"
    description = "List files and directories in a path."
    args_model = ListDirectoryArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: ListDirectoryArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            request_id=str(uuid.uuid4()),
            log_message=f"Remote list directory tool call: {args.path}",
        )


class RemoteGlobTool(RemoteToolBase, Tool[GlobArgs]):
    name = "glob"
    description = "Find files matching glob patterns."
    args_model = GlobArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: GlobArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote glob tool call: {args.pattern}",
        )


class RemoteReplaceTool(RemoteToolBase, Tool[ReplaceArgs]):
    name = "replace"
    description = (
        "Replace exact text in a file. Use for surgical edits when you know the exact "
        "old_string and the desired new_string."
    )
    args_model = ReplaceArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: ReplaceArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote replace tool call: {args.file_path}",
        )


class RemoteSearchFileContentTool(RemoteToolBase, Tool[SearchFileContentArgs]):
    name = "search_file_content"
    description = (
        "Search for a regex pattern in file contents under a directory "
        "(with optional include filter)."
    )
    args_model = SearchFileContentArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: SearchFileContentArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote search_file_content tool call: {args.pattern}",
        )


class RemoteReadManyFilesTool(RemoteToolBase, Tool[ReadManyFilesArgs]):
    name = "read_many_files"
    description = (
        "Read multiple files/directories/globs and return concatenated content "
        "with per-file separators."
    )
    args_model = ReadManyFilesArgs
    category = ToolDomain.FILESYSTEM

    async def execute_remote(self, args: ReadManyFilesArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote read_many_files tool call: {len(args.paths)} path(s)",
        )
