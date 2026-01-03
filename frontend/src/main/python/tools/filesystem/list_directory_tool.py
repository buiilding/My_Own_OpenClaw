"""
Frontend List Directory Tool

Tool for listing files and directories on the local computer.
"""

import logging
from typing import Dict, Any
from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)


class ListDirectoryArgs(BaseModel):
    """Arguments for list directory tool."""
    path: str = Field(
        ...,
        description="The absolute path to the directory to list."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class ListDirectoryTool(FrontendTool[ListDirectoryArgs]):
    """
    List contents of a directory on the local file system.
    """

    name = "list_directory"
    description = "List files and directories in a path."
    args_model = ListDirectoryArgs

    async def run(self, args: ListDirectoryArgs) -> Dict[str, Any]:
        """
        List the specified directory.
        """
        import asyncio
        import os
        from core.thread_pool import get_executor
        
        try:
            if not os.path.isabs(args.path):
                return SimpleToolResult.failure(f"Path must be absolute: {args.path}").to_dict()

            loop = asyncio.get_running_loop()
            executor = get_executor()

            # Check if exists and is dir (blocking ops)
            if not await loop.run_in_executor(executor, os.path.exists, args.path):
                return SimpleToolResult.failure(f"Path not found: {args.path}").to_dict()

            if not await loop.run_in_executor(executor, os.path.isdir, args.path):
                return SimpleToolResult.failure(f"Not a directory: {args.path}").to_dict()

            # List directory (blocking op)
            items = await loop.run_in_executor(executor, os.listdir, args.path)
            items.sort()

            def get_formatted_items():
                formatted = []
                for item in items:
                    full_path = os.path.join(args.path, item)
                    if os.path.isdir(full_path):
                        formatted.append(f"[DIR] {item}")
                    else:
                        formatted.append(f"[FILE] {item}")
                return formatted

            formatted_items = await loop.run_in_executor(executor, get_formatted_items)
            content = "\n".join(formatted_items) if formatted_items else "Directory is empty."

            return {
                "success": True,
                "data": {
                    "path": args.path,
                    "items": items,
                    "llm_content": content,
                }
            }

        except Exception as e:
            logger.error(f"List directory tool error: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Failed to list directory: {str(e)}").to_dict()
