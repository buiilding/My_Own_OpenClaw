"""
Replace Tool.

Tool for search/replace text in files with fuzzy matching.
"""

import logging
import os
from typing import Any, Optional, Tuple

from backend.tools.base import Kind, Tool, ToolContext, ToolResult
from backend.utils.file_utils import (
    DEFAULT_ENCODING,
    ensure_directory_exists,
    make_relative_path,
    read_text_file_auto_encoding,
    shorten_path,
)

logger = logging.getLogger(__name__)


class ReplaceTool(Tool):
    """Tool for search/replace text in files with fuzzy matching."""

    def __init__(self, config: Any):
        super().__init__(
            name="replace",
            description="Replaces text within a file. By default, replaces a single occurrence, but can replace multiple occurrences when `expected_replacements` is specified. This tool requires providing significant context around the change to ensure precise targeting.",
            kind=Kind.EDIT,
        )
        self.config = config

    async def execute_async(
        self,
        context: ToolContext,
        file_path: str,
        old_string: str,
        new_string: str,
        expected_replacements: Optional[int] = None,
    ) -> ToolResult:
        """Execute the replace tool."""
        try:
            expected_replacements = (
                expected_replacements if expected_replacements is not None else 1
            )

            # Validate required parameters
            if not file_path:
                return ToolResult(
                    success=False,
                    error="file_path parameter is required",
                    llm_content="Error: file_path parameter is required",
                    return_display="file_path parameter is required",
                )

            # Validate path is absolute
            if not os.path.isabs(file_path):
                return ToolResult(
                    success=False,
                    error=f"File path must be absolute: {file_path}",
                    llm_content=f"Error: File path must be absolute: {file_path}",
                    return_display="File path must be absolute",
                )

            # Get target directory for relative path resolution
            target_dir = self.config.get_workspace_context().workspace_path

            # Check if path is within workspace
            workspace_context = self.config.get_workspace_context()
            if not workspace_context.is_path_within_workspace(file_path):
                return ToolResult(
                    success=False,
                    error=f"File path must be within workspace: {file_path}",
                    llm_content=f"Error: File path must be within workspace: {file_path}",
                    return_display="File path not within workspace",
                )

            # Handle file creation case
            file_exists = os.path.exists(file_path)
            if not file_exists and not old_string:
                # Create new file
                try:
                    ensure_directory_exists(os.path.dirname(file_path))
                    with open(file_path, "w", encoding=DEFAULT_ENCODING) as f:
                        f.write(new_string)
                    return ToolResult(
                        success=True,
                        data={"replacements": 1, "is_new_file": True},
                        llm_content=f"Created new file: {file_path} with provided content.",
                        return_display=f"Created new file: {shorten_path(make_relative_path(file_path, target_dir))}",
                    )
                except OSError as e:
                    return ToolResult(
                        success=False,
                        error=f"Failed to create file: {e}",
                        llm_content=f"Error: Failed to create file: {e}",
                        return_display="Failed to create file",
                    )

            # Handle existing file editing
            if not file_exists:
                return ToolResult(
                    success=False,
                    error=f"File does not exist and old_string is not empty: {file_path}",
                    llm_content=f"Error: File does not exist and old_string is not empty: {file_path}",
                    return_display="File does not exist",
                )

            # Read current file content
            try:
                current_content, _ = read_text_file_auto_encoding(file_path)
            except Exception as e:
                return ToolResult(
                    success=False,
                    error=f"Failed to read file: {e}",
                    llm_content=f"Error: Failed to read file: {e}",
                    return_display="Failed to read file",
                )

            # Perform replacement
            new_content, replacements = self._perform_replacement(
                current_content, old_string, new_string, expected_replacements
            )

            if replacements == 0:
                return ToolResult(
                    success=False,
                    error="Failed to edit, could not find the string to replace",
                    llm_content="Failed to edit, could not find the string to replace.",
                    return_display="No occurrences found to replace",
                )

            if replacements != expected_replacements:
                return ToolResult(
                    success=False,
                    error=f"Failed to edit, expected {expected_replacements} occurrence(s) but found {replacements}",
                    llm_content=f"Failed to edit, expected {expected_replacements} occurrence(s) but found {replacements}.",
                    return_display=f"Expected {expected_replacements} but found {replacements} occurrences",
                )

            # Write back the modified content
            try:
                with open(file_path, "w", encoding=DEFAULT_ENCODING) as f:
                    f.write(new_content)
            except OSError as e:
                return ToolResult(
                    success=False,
                    error=f"Failed to write file: {e}",
                    llm_content=f"Error: Failed to write file: {e}",
                    return_display="Failed to write file",
                )

            return ToolResult(
                success=True,
                data={"replacements": replacements, "is_new_file": False},
                llm_content=f"Successfully modified file: {file_path} ({replacements} replacements).",
                return_display=f"Modified file: {shorten_path(make_relative_path(file_path, target_dir))} ({replacements} replacements)",
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected error: {str(e)}",
                return_display="Unexpected error occurred",
            )

    def _perform_replacement(
        self, content: str, old_string: str, new_string: str, expected_count: int
    ) -> Tuple[str, int]:
        """Perform the actual replacement operation."""
        # TODO: Implement fuzzy matching like Gemini CLI
        # For now, use exact string matching
        count = content.count(old_string)
        if count == 0:
            return content, 0

        if count != expected_count and expected_count != -1:  # -1 means replace all
            return content, count

        # Perform replacement
        replace_count = expected_count if expected_count > 0 else count
        new_content = content.replace(old_string, new_string, replace_count)

        return new_content, replace_count
