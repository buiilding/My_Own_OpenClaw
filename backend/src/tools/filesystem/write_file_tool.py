"""
Write File Tool.

Tool for creating/overwriting files with content.
"""
import logging
import os
from typing import Any

from backend.src.tools.base import Kind, Tool, ToolContext, ToolResult
from backend.src.tools.system.shell_tool import ShellTool
from backend.src.core.utils.file_utils import (
    DEFAULT_ENCODING,
    ensure_directory_exists,
    make_relative_path,
    shorten_path,
)

logger = logging.getLogger(__name__)


class WriteFileTool(Tool):
    """Tool for creating/overwriting files with content."""

    def __init__(self, config: Any):
        super().__init__(
            name="write_file",
            description="Writes content to a specified file in the local filesystem. The user has the ability to modify `content`. If modified, this will be stated in the response.",
            kind=Kind.EDIT,
        )
        self.config = config

    async def execute_async(
        self, context: ToolContext, file_path: str, content: str
    ) -> ToolResult:
        """Execute the write_file tool."""
        try:
            if not file_path:
                return ToolResult(
                    success=False,
                    error="file_path parameter is required",
                    llm_content="Error: file_path parameter is required",
                    return_display="file_path parameter is required",
                )

            # Resolve relative paths to absolute paths
            workspace_context = self.config.get_workspace_context()
            if not os.path.isabs(file_path):
                # Resolve relative path to absolute using current working directory (from shell tool)
                current_dir = ShellTool.get_current_working_directory()
                file_path = os.path.abspath(os.path.join(current_dir, file_path))
                logger.info(
                    f"WriteFile: Resolved relative path to absolute using current dir: {file_path}"
                )

            # Get target directory for relative path resolution
            target_dir = workspace_context.workspace_path

            # Removed workspace restriction - allow operations anywhere on the system

            # Check if trying to overwrite a directory
            if os.path.exists(file_path) and os.path.isdir(file_path):
                return ToolResult(
                    success=False,
                    error=f"Path is a directory, not a file: {file_path}",
                    llm_content=f"Error: Path is a directory, not a file: {file_path}",
                    return_display="Cannot write to directory",
                )

            # Ensure parent directory exists
            ensure_directory_exists(os.path.dirname(file_path))

            # Write the file
            try:
                with open(file_path, "w", encoding=DEFAULT_ENCODING) as f:
                    f.write(content)
            except OSError as e:
                return ToolResult(
                    success=False,
                    error=f"Failed to write file: {e}",
                    llm_content=f"Error: Failed to write file: {e}",
                    return_display="Failed to write file",
                )

            # Check if file was newly created or overwritten
            file_existed = os.path.exists(file_path)  # This will be true now
            is_new_file = not file_existed  # We checked before writing

            # Create success message
            if is_new_file:
                llm_content = (
                    f"Successfully created and wrote to new file: {file_path}."
                )
            else:
                llm_content = f"Successfully overwrote file: {file_path}."

            return ToolResult(
                success=True,
                data={
                    "file_path": file_path,
                    "is_new_file": is_new_file,
                    "content_length": len(content),
                },
                llm_content=llm_content,
                return_display=f"{'Created' if is_new_file else 'Updated'} file: {shorten_path(make_relative_path(file_path, target_dir))}",
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected error: {str(e)}",
                return_display="Unexpected error occurred",
            )
