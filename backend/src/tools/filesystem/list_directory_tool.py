"""
List Directory Tool (SDK Version).

Tool for listing files and directories in a path.
"""
import logging
import os
import re
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.src.core.utils.path_utils import make_relative_path
from backend.src.core.security.policy import Permission
from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.filesystem.data_structures import FileEntry
from backend.src.tools.system.shell_tool import ShellTool

logger = logging.getLogger(__name__)


class ListDirectoryArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(
        ..., description="Directory path to list (absolute or relative to workspace)"
    )
    ignore: Optional[List[str]] = Field(
        None,
        description="List of glob patterns to ignore (e.g., ['*.pyc', '__pycache__'])",
    )
    file_filtering_options: Optional[Dict[str, bool]] = Field(
        None,
        description="File filtering options (respect_git_ignore, respect_gemini_ignore)",
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class ListDirectoryTool(Tool[ListDirectoryArgs]):
    """Tool for listing files and directories in a path."""

    name = "list_directory"
    required_permissions = {Permission.READ_FILESYSTEM}
    category = ToolDomain.FILESYSTEM
    description = """Lists files and subdirectories in a directory. Use this to explore directory structure and discover files before reading them.

WHEN TO USE:
- Exploring directory structure to understand project layout
- Discovering what files exist in a directory before reading them
- Understanding file organization

After listing, use read_file to examine file contents, or glob to find files by pattern."""
    args_model = ListDirectoryArgs

    async def run(self, args: ListDirectoryArgs, ctx: ToolContext) -> dict:
        """Execute the list_directory tool."""
        try:
            logger.info(
                f"ListDirectory tool called with path: '{args.path}', ignore: {args.ignore}, file_filtering_options: {args.file_filtering_options}"
            )
            ignore = args.ignore or []
            file_filtering_options = args.file_filtering_options or {}

            if not args.path:
                logger.error("ListDirectory: No path provided")
                return {
                    "error": "Path parameter is required",
                    "llm_content": "Error: Path parameter is required",
                }

            # Resolve relative paths to absolute paths
            path = args.path
            logger.info(
                f"ListDirectory: Path is absolute check: {os.path.isabs(path)} for path: {path}"
            )

            workspace_context = ctx.services.get("workspace_context")
            if workspace_context:
                target_dir = workspace_context.workspace_path
            else:
                target_dir = ctx.workspace_root

            logger.info(f"ListDirectory: Got workspace context: {workspace_context}")

            if not os.path.isabs(path):
                # Resolve relative path to absolute using current working directory (from shell tool)
                session_id = ctx.session.session_id
                user_id = ctx.user.user_id
                current_dir = ShellTool.get_current_working_directory(session_id, user_id)
                path = os.path.abspath(os.path.join(current_dir, path))
                logger.info(
                    f"ListDirectory: Resolved relative path to absolute using current dir: {path}"
                )

            # Check if directory exists
            logger.info(
                f"ListDirectory: Checking if directory exists: {os.path.exists(path)} for path: {path}"
            )
            if not os.path.exists(path):
                logger.error(f"ListDirectory: Directory not found: {path}")
                return {
                    "error": f"Directory not found: {path}",
                    "llm_content": f"Error: Directory not found: {path}",
                }

            logger.info(
                f"ListDirectory: Checking if path is directory: {os.path.isdir(path)} for path: {path}"
            )
            if not os.path.isdir(path):
                logger.error(f"ListDirectory: Path is not a directory: {path}")
                return {
                    "error": f"Path is not a directory: {path}",
                    "llm_content": f"Error: Path is not a directory: {path}",
                }

            # List directory contents
            try:
                logger.info(f"ListDirectory: Listing directory contents for: {path}")
                entries = os.listdir(path)
                logger.info(f"ListDirectory: Found {len(entries)} entries: {entries}")
            except OSError as e:
                logger.error(f"ListDirectory: Failed to list directory {path}: {e}")
                return {
                    "error": f"Failed to list directory: {e}",
                    "llm_content": f"Error: Failed to list directory: {e}",
                }

            if not entries:
                content = f"Directory {path} is empty."
                return {
                    "entries": [],
                    "llm_content": content,
                    "return_display": "Directory is empty",
                }

            # Convert to full paths and filter
            logger.info(
                "ListDirectory: Converting to full paths and setting up filtering"
            )
            full_paths = [os.path.join(path, entry) for entry in entries]
            logger.info(f"ListDirectory: Full paths: {full_paths}")

            file_service = ctx.services.get("file_service")
            logger.info(f"ListDirectory: Got file service: {file_service}")

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
            logger.info(f"ListDirectory: Target dir: {target_dir}")
            relative_paths = [make_relative_path(p, target_dir) for p in full_paths]
            logger.info(f"ListDirectory: Relative paths: {relative_paths}")

            logger.info("ListDirectory: Calling filter_files_with_report")
            if file_service:
                filtered_paths, ignored_count = file_service.filter_files_with_report(
                    relative_paths, filtering_options
                )
            else:
                # No file service, include all paths
                filtered_paths = relative_paths
                ignored_count = 0

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
            return {
                "entries": [
                    {
                        "name": e.name,
                        "path": e.path,
                        "is_directory": e.is_directory,
                        "size": e.size,
                        "modified_time": e.modified_time,
                    }
                    for e in file_entries
                ],
                "llm_content": content,
                "return_display": display,
            }

        except Exception as e:
            logger.error(
                f"ListDirectory: Unexpected error for path {args.path}: {e}",
                exc_info=True,
            )
            return {
                "error": f"Unexpected error: {str(e)}",
                "llm_content": f"Error: Unexpected error: {str(e)}",
            }

    def _matches_pattern(self, filename: str, pattern: str) -> bool:
        """Check if a filename matches a glob pattern."""
        # Simple glob to regex conversion
        regex_pattern = pattern.replace(".", "\\.").replace("*", ".*").replace("?", ".")
        try:
            return bool(re.match(f"^{regex_pattern}$", filename))
        except re.error:
            return False
