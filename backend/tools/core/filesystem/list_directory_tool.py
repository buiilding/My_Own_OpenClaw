"""
List Directory Tool.

Tool for listing files and directories in a path.
"""

import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.tools.base import Kind, Tool, ToolContext, ToolResult
from backend.tools.core.system.shell_tool import ShellTool
from backend.utils.file_utils import make_relative_path

from .data_structures import FileEntry

logger = logging.getLogger(__name__)


class ListDirectoryTool(Tool):
    """Tool for listing files and directories in a path."""

    def __init__(self, config: Any):
        super().__init__(
            name="list_directory",
            description="Lists the names of files and subdirectories directly within a specified directory path. Can optionally ignore entries matching provided glob patterns.",
            kind=Kind.SEARCH,
        )
        self.config = config

    async def execute_async(
        self,
        context: ToolContext,
        path: str,
        ignore: Optional[List[str]] = None,
        file_filtering_options: Optional[Dict[str, Any]] = None,
    ) -> ToolResult:
        """Execute the list_directory tool."""
        try:
            logger.info(
                f"ListDirectory tool called with path: '{path}', ignore: {ignore}, file_filtering_options: {file_filtering_options}"
            )
            ignore = ignore or []
            file_filtering_options = file_filtering_options or {}

            if not path:
                logger.error("ListDirectory: No path provided")
                return ToolResult(
                    success=False,
                    error="Path parameter is required",
                    llm_content="Error: Path parameter is required",
                    return_display="Error: Path parameter is required",
                )

            # Resolve relative paths to absolute paths and get workspace context
            logger.info(
                f"ListDirectory: Path is absolute check: {os.path.isabs(path)} for path: {path}"
            )
            workspace_context = self.config.get_workspace_context()
            logger.info(f"ListDirectory: Got workspace context: {workspace_context}")

            if not os.path.isabs(path):
                # Resolve relative path to absolute using current working directory (from shell tool)
                current_dir = ShellTool.get_current_working_directory()
                path = os.path.abspath(os.path.join(current_dir, path))
                logger.info(
                    f"ListDirectory: Resolved relative path to absolute using current dir: {path}"
                )

            # Removed workspace restriction - allow operations anywhere on the system

            # Check if directory exists
            logger.info(
                f"ListDirectory: Checking if directory exists: {os.path.exists(path)} for path: {path}"
            )
            if not os.path.exists(path):
                logger.error(f"ListDirectory: Directory not found: {path}")
                return ToolResult(
                    success=False,
                    error=f"Directory not found: {path}",
                    llm_content=f"Error: Directory not found: {path}",
                    return_display="Directory not found",
                )

            logger.info(
                f"ListDirectory: Checking if path is directory: {os.path.isdir(path)} for path: {path}"
            )
            if not os.path.isdir(path):
                logger.error(f"ListDirectory: Path is not a directory: {path}")
                return ToolResult(
                    success=False,
                    error=f"Path is not a directory: {path}",
                    llm_content=f"Error: Path is not a directory: {path}",
                    return_display="Path is not a directory",
                )

            # List directory contents
            try:
                logger.info(f"ListDirectory: Listing directory contents for: {path}")
                entries = os.listdir(path)
                logger.info(f"ListDirectory: Found {len(entries)} entries: {entries}")
            except OSError as e:
                logger.error(f"ListDirectory: Failed to list directory {path}: {e}")
                return ToolResult(
                    success=False,
                    error=f"Failed to list directory: {e}",
                    llm_content=f"Error: Failed to list directory: {e}",
                    return_display="Failed to list directory",
                )

            if not entries:
                content = f"Directory {path} is empty."
                return ToolResult(
                    success=True,
                    data=[],
                    llm_content=content,
                    return_display="Directory is empty",
                )

            # Convert to full paths and filter
            logger.info(
                "ListDirectory: Converting to full paths and setting up filtering"
            )
            full_paths = [os.path.join(path, entry) for entry in entries]
            logger.info(f"ListDirectory: Full paths: {full_paths}")
            file_discovery = self.config.get_file_service()
            logger.info(f"ListDirectory: Got file service: {file_discovery}")
            filtering_options = {
                "respect_git_ignore": file_filtering_options.get(
                    "respect_git_ignore", True
                ),
                "respect_gemini_ignore": file_filtering_options.get(
                    "respect_gemini_ignore", True
                ),
            }
            logger.info(f"ListDirectory: Filtering options: {filtering_options}")

            # Convert to relative paths for filtering
            target_dir = self.config.get_workspace_context().workspace_path
            logger.info(f"ListDirectory: Target dir: {target_dir}")
            relative_paths = [make_relative_path(p, target_dir) for p in full_paths]
            logger.info(f"ListDirectory: Relative paths: {relative_paths}")

            logger.info("ListDirectory: Calling filter_files_with_report")
            filtered_paths, ignored_count = file_discovery.filter_files_with_report(
                relative_paths, filtering_options
            )
            logger.info(
                f"ListDirectory: Filtered paths: {filtered_paths}, ignored_count: {ignored_count}"
            )

            # Apply ignore patterns
            filtered_full_paths = []
            for full_path in full_paths:
                relative_path = make_relative_path(full_path, target_dir)
                if relative_path in filtered_paths:
                    # Check ignore patterns
                    should_ignore = False
                    for pattern in ignore:
                        if self._matches_pattern(os.path.basename(full_path), pattern):
                            should_ignore = True
                            break
                    if not should_ignore:
                        filtered_full_paths.append(full_path)

            # Create FileEntry objects
            file_entries = []
            for full_path in filtered_full_paths:
                file_entries.append(FileEntry.from_path(Path(full_path)))

            # Sort: directories first, then alphabetically
            file_entries.sort(key=lambda x: (not x.is_directory, x.name.lower()))

            # Create output
            logger.info("ListDirectory: Creating output")
            lines = []
            for entry in file_entries:
                prefix = "[DIR]" if entry.is_directory else ""
                lines.append(f"{prefix}{entry.name}")

            content = f"Directory listing for {path}:\n" + "\n".join(lines)
            if ignored_count > 0:
                content += f"\n\n({ignored_count} ignored)"

            display = f"Listed {len(file_entries)} item(s)."
            if ignored_count > 0:
                display += f" ({ignored_count} ignored)"

            logger.info(
                f"ListDirectory: Returning success with {len(file_entries)} entries"
            )
            return ToolResult(
                success=True,
                data=file_entries,
                llm_content=content,
                return_display=display,
            )

        except Exception as e:
            logger.error(
                f"ListDirectory: Unexpected error for path {path}: {e}", exc_info=True
            )
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected error: {str(e)}",
                return_display="Unexpected error occurred",
            )

    def _matches_pattern(self, filename: str, pattern: str) -> bool:
        """Check if a filename matches a glob pattern."""
        # Simple glob to regex conversion
        regex_pattern = pattern.replace(".", "\\.").replace("*", ".*").replace("?", ".")
        try:
            return bool(re.match(f"^{regex_pattern}$", filename))
        except re.error:
            return False
