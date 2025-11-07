"""
Read File Tool.

Tool for reading text files, images, PDFs with optional line ranges.
"""

import logging
import os
from pathlib import Path
from typing import Any, Optional

from backend.tools.base import Kind, Tool, ToolContext, ToolResult
from backend.utils.file_utils import (
    get_specific_mime_type,
    is_text_file,
    read_file_content,
    read_text_file_auto_encoding,
)

logger = logging.getLogger(__name__)


class ReadFileTool(Tool):
    """Tool for reading text files, images, PDFs with optional line ranges."""

    def __init__(self, config: Any):
        super().__init__(
            name="read_file",
            description="Reads and returns the content of a specified file. If the file is large, the content will be truncated. The tool's response will clearly indicate if truncation has occurred and will provide details on how to read more of the file using the 'offset' and 'limit' parameters. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), and PDF files. For text files, it can read specific line ranges.",
            kind=Kind.READ,
        )
        self.config = config

    async def execute_async(
        self,
        context: ToolContext,
        absolute_path: Optional[str] = None,
        path: Optional[str] = None,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> ToolResult:
        """Execute the read_file tool."""
        try:
            # Accept both 'absolute_path' and 'path' for flexibility
            absolute_path = absolute_path or path or ""

            logger.info(
                f"ReadFile tool called with path: '{absolute_path}', offset: {offset}, limit: {limit}"
            )

            if not absolute_path:
                logger.error("ReadFile: No path provided")
                return ToolResult(
                    success=False,
                    error="absolute_path or path parameter is required",
                    llm_content="Error: absolute_path or path parameter is required",
                    return_display="absolute_path or path parameter is required",
                )

            # Validate path is absolute
            if not os.path.isabs(absolute_path):
                logger.error(f"ReadFile: Path is not absolute: {absolute_path}")
                return ToolResult(
                    success=False,
                    error=f"File path must be absolute: {absolute_path}",
                    llm_content=f"Error: File path must be absolute: {absolute_path}",
                    return_display="File path must be absolute",
                )

            logger.info(
                f"ReadFile: Path is absolute, checking workspace: {absolute_path}"
            )

            # Check if path is within workspace
            logger.info("ReadFile: About to get workspace context")
            try:
                workspace_context = self.config.get_workspace_context()
                logger.info(f"ReadFile: Got workspace context: {workspace_context}")
                logger.info(
                    f"ReadFile: Workspace context type: {type(workspace_context)}"
                )
            except Exception as e:
                logger.error(f"ReadFile: Failed to get workspace context: {e}")
                return ToolResult(
                    success=False,
                    error=f"Failed to get workspace context: {e}",
                    llm_content=f"Error: Failed to get workspace context: {e}",
                    return_display="Workspace context error",
                )

            try:
                project_temp_dir = self.config.storage.get_project_temp_dir()
                logger.info(f"ReadFile: Temp dir: {project_temp_dir}")
            except Exception as e:
                logger.error(f"ReadFile: Failed to get project temp dir: {e}")
                return ToolResult(
                    success=False,
                    error=f"Failed to get project temp dir: {e}",
                    llm_content=f"Error: Failed to get project temp dir: {e}",
                    return_display="Temp dir error",
                )

            try:
                is_within_workspace = workspace_context.is_path_within_workspace(
                    absolute_path
                )
                logger.info(
                    f"ReadFile: is_within_workspace check completed: {is_within_workspace}"
                )
            except Exception as e:
                logger.error(
                    f"ReadFile: Failed to check if path is within workspace: {e}"
                )
                return ToolResult(
                    success=False,
                    error=f"Failed to check workspace path: {e}",
                    llm_content=f"Error: Failed to check workspace path: {e}",
                    return_display="Workspace path check error",
                )

            is_within_temp = (
                absolute_path.startswith(project_temp_dir)
                if project_temp_dir
                else False
            )

            logger.info(
                f"ReadFile: is_within_workspace={is_within_workspace}, is_within_temp={is_within_temp}"
            )

            if not (is_within_workspace or is_within_temp):
                logger.error(
                    f"ReadFile: Path not within allowed directories: {absolute_path}"
                )
                return ToolResult(
                    success=False,
                    error=f"File path must be within workspace or temp directory: {absolute_path}",
                    llm_content=f"Error: File path must be within workspace or temp directory: {absolute_path}",
                    return_display="File path not within allowed directories",
                )

            # Check file filtering
            file_service = self.config.get_file_service()
            file_filtering_options = self.config.get_file_filtering_options()
            if file_service.should_ignore_file(absolute_path, file_filtering_options):
                return ToolResult(
                    success=False,
                    error=f"File is ignored by filtering rules: {absolute_path}",
                    llm_content=f"Error: File is ignored by filtering rules: {absolute_path}",
                    return_display="File is ignored",
                )

            # Validate parameters
            if offset is not None and offset < 0:
                return ToolResult(
                    success=False,
                    error="Offset must be non-negative",
                    llm_content="Error: Offset must be non-negative",
                    return_display="Invalid offset parameter",
                )

            if limit is not None and limit <= 0:
                return ToolResult(
                    success=False,
                    error="Limit must be positive",
                    llm_content="Error: Limit must be positive",
                    return_display="Invalid limit parameter",
                )

            # Read file content
            content, error, is_truncated = read_file_content(
                absolute_path, offset, limit
            )

            if error:
                return ToolResult(
                    success=False,
                    error=error,
                    llm_content=f"Error: {error}",
                    return_display=error,
                )

            # Format response
            if is_truncated:
                lines_shown = content.count("\n") + 1 if content else 0
                total_lines = self._get_total_lines(absolute_path)
                next_offset = (offset or 0) + lines_shown

                llm_content = (
                    "IMPORTANT: The file content has been truncated.\n"
                    f"Status: Showing lines {offset or 0 + 1}-{offset or 0 + lines_shown} of {total_lines} total lines.\n"
                    "Action: To read more of the file, you can use the 'offset' and 'limit' parameters in a subsequent 'read_file' call. "
                    f"For example, to read the next section of the file, use offset: {next_offset}.\n\n"
                    "--- FILE CONTENT (truncated) ---\n"
                    f"{content}"
                )
            else:
                llm_content = content

            # Get metadata for telemetry
            lines = content.count("\n") + 1 if isinstance(content, str) else None
            mimetype = get_specific_mime_type(absolute_path)
            programming_language = self._get_programming_language(absolute_path)

            return ToolResult(
                success=True,
                data={
                    "content": content,
                    "is_truncated": is_truncated,
                    "lines": lines,
                    "mimetype": mimetype,
                    "programming_language": programming_language,
                },
                llm_content=llm_content,
                return_display=content
                if len(content) < 500
                else f"Read {len(content)} characters",
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected error: {str(e)}",
                return_display="Unexpected error occurred",
            )

    def _get_total_lines(self, file_path: str) -> int:
        """Get the total number of lines in a text file."""
        try:
            if is_text_file(file_path):
                content, _ = read_text_file_auto_encoding(file_path)
                return content.count("\n") + 1
        except Exception:
            pass
        return 0

    def _get_programming_language(self, file_path: str) -> Optional[str]:
        """Get the programming language for a file."""
        ext = Path(file_path).suffix.lower()
        language_map = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".jsx": "javascript",
            ".tsx": "typescript",
            ".java": "java",
            ".cpp": "cpp",
            ".c": "c",
            ".h": "c",
            ".hpp": "cpp",
            ".rs": "rust",
            ".go": "go",
            ".php": "php",
            ".rb": "ruby",
            ".html": "html",
            ".css": "css",
            ".sql": "sql",
            ".sh": "bash",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".json": "json",
            ".xml": "xml",
            ".md": "markdown",
        }
        return language_map.get(ext)
