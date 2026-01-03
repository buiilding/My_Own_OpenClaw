"""
Frontend Read File Tool

Tool for reading file contents on the local computer.
"""

import logging
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)


class ReadFileArgs(BaseModel):
    """Arguments for read file tool."""
    file_path: str = Field(
        ...,
        description="The path to the file to read (absolute path)"
    )
    offset: Optional[int] = Field(
        None, ge=0, description="Line number to start reading from (0-based)"
    )
    limit: Optional[int] = Field(None, gt=0, description="Number of lines to read")

    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class ReadFileTool(FrontendTool[ReadFileArgs]):
    """
    Read file contents from the local file system.
    """

    name = "read_file"
    description = "Read file contents. Use this tool to examine existing files."
    args_model = ReadFileArgs

    async def run(self, args: ReadFileArgs) -> Dict[str, Any]:
        """
        Read the specified file.
        """
        import asyncio
        import os
        from core.thread_pool import get_executor
        
        try:
            if not os.path.isabs(args.file_path):
                return SimpleToolResult.failure(f"File path must be absolute: {args.file_path}").to_dict()

            loop = asyncio.get_running_loop()
            executor = get_executor()

            # Blocking check calls
            exists = await loop.run_in_executor(executor, os.path.exists, args.file_path)
            if not exists:
                return SimpleToolResult.failure(f"File not found: {args.file_path}").to_dict()

            is_file = await loop.run_in_executor(executor, os.path.isfile, args.file_path)
            if not is_file:
                return SimpleToolResult.failure(f"Not a file: {args.file_path}").to_dict()

            def read_file_lines():
                with open(args.file_path, 'r', encoding='utf-8', errors='replace') as f:
                    return f.readlines()

            lines = await loop.run_in_executor(executor, read_file_lines)

            start = args.offset if args.offset is not None else 0
            end = start + args.limit if args.limit is not None else len(lines)
            
            content_lines = lines[start:end]
            content = "".join(content_lines)

            return {
                "success": True,
                "data": {
                    "content": content,
                    "file_path": args.file_path,
                    "total_lines": len(lines),
                    "read_lines": len(content_lines),
                    "llm_content": content if content else "File is empty.",
                }
            }

        except Exception as e:
            logger.error(f"Read file tool error: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Failed to read file: {str(e)}").to_dict()
