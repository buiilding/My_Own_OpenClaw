"""
Frontend Write File Tool

Tool for creating or overwriting files on the local computer.
"""

import logging
from typing import Dict, Any
from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)


class WriteFileArgs(BaseModel):
    """Arguments for write file tool."""
    file_path: str = Field(
        ...,
        description="The path to the file to write (absolute path)"
    )
    content: str = Field(
        ...,
        description="The full content to write to the file. This will overwrite existing content."
    )
    
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class WriteFileTool(FrontendTool[WriteFileArgs]):
    """
    Create or overwrite a file on the local file system.
    """

    name = "write_file"
    description = "Create or overwrite files with content."
    args_model = WriteFileArgs

    async def run(self, args: WriteFileArgs) -> Dict[str, Any]:
        """
        Write content to the specified file.
        """
        import asyncio
        import os
        from core.thread_pool import get_executor
        
        try:
            if not os.path.isabs(args.file_path):
                return SimpleToolResult.failure(f"File path must be absolute: {args.file_path}").to_dict()

            loop = asyncio.get_running_loop()
            executor = get_executor()

            def write_file():
                # Ensure directory exists
                os.makedirs(os.path.dirname(args.file_path), exist_ok=True)
                with open(args.file_path, 'w', encoding='utf-8') as f:
                    f.write(args.content)

            await loop.run_in_executor(executor, write_file)

            return {
                "success": True,
                "data": {
                    "file_path": args.file_path,
                    "bytes_written": len(args.content),
                    "llm_content": f"Successfully wrote to {args.file_path}",
                }
            }

        except Exception as e:
            logger.error(f"Write file tool error: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Failed to write file: {str(e)}").to_dict()
