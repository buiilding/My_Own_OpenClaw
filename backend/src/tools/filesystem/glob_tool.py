"""
Glob Tool (SDK Version).

Tool for finding files matching glob patterns.
"""
import logging
import os
from glob import glob as glob_module
from pathlib import Path
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.filesystem.data_structures import GlobEntry
from backend.src.tools.system.shell_tool import ShellTool
from backend.src.core.utils.file_utils import make_relative_path

logger = logging.getLogger(__name__)


class GlobArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    pattern: str = Field(..., description="Glob pattern to search for (e.g., 'src/**/*.ts', '**/*.md')")
    path: Optional[str] = Field(None, description="Directory path to search in (defaults to current working directory)")
    case_sensitive: Optional[bool] = Field(None, description="Whether pattern matching is case sensitive (reserved for future use)")
    file_filtering_options: Optional[Dict[str, bool]] = Field(None, description="File filtering options (respect_git_ignore, respect_gemini_ignore)")


class GlobTool(Tool[GlobArgs]):
    """Tool for finding files matching glob patterns."""
    
    name = "glob"
    description = "Efficiently finds files matching specific glob patterns (e.g., `src/**/*.ts`, `**/*.md`), returning absolute paths sorted by modification time (newest first). Ideal for quickly locating files based on their name or path structure, especially in large codebases."
    args_model = GlobArgs

    async def run(self, args: GlobArgs, ctx: ToolContext) -> dict:
        """Execute the glob tool."""
        try:
            respect_git_ignore = (
                args.file_filtering_options.get("respect_git_ignore", True)
                if args.file_filtering_options else True
            )
            respect_gemini_ignore = (
                args.file_filtering_options.get("respect_gemini_ignore", True)
                if args.file_filtering_options else True
            )

            if not args.pattern:
                return {
                    "error": "pattern parameter is required",
                    "llm_content": "Error: pattern parameter is required"
                }

            # Get workspace context for relative path resolution
            workspace_context = ctx.services.get("workspace_context")
            if workspace_context:
                target_dir = workspace_context.workspace_path
            else:
                target_dir = ctx.workspace_root

            # Determine search directory
            if args.path:
                if not os.path.isabs(args.path):
                    # Use current working directory from shell tool
                    current_dir = ShellTool.get_current_working_directory()
                    search_dir = os.path.join(current_dir, args.path)
                else:
                    search_dir = args.path
            else:
                # Use current working directory from shell tool
                search_dir = ShellTool.get_current_working_directory()

            if not os.path.exists(search_dir):
                return {
                    "error": f"Search path does not exist: {search_dir}",
                    "llm_content": f"Error: Search path does not exist: {search_dir}"
                }

            if not os.path.isdir(search_dir):
                return {
                    "error": f"Search path is not a directory: {search_dir}",
                    "llm_content": f"Error: Search path is not a directory: {search_dir}"
                }

            # Perform glob search
            try:
                # Use glob with appropriate options
                glob_pattern = os.path.join(search_dir, args.pattern)
                matches = glob_module(glob_pattern, recursive=True)

                # Filter out directories
                file_matches = [m for m in matches if os.path.isfile(m)]

            except Exception as e:
                return {
                    "error": f"Glob search failed: {e}",
                    "llm_content": f"Error: Glob search failed: {e}"
                }

            if not file_matches:
                content = (
                    f'No files found matching pattern "{args.pattern}" within {search_dir}'
                )
                return {
                    "entries": [],
                    "llm_content": content,
                    "return_display": "No files found"
                }

            # Apply file filtering
            file_service = ctx.services.get("file_service")
            relative_paths = [make_relative_path(p, target_dir) for p in file_matches]

            filtering_options = {
                "respect_git_ignore": respect_git_ignore,
                "respect_gemini_ignore": respect_gemini_ignore,
            }

            if file_service:
                filtered_paths, ignored_count = file_service.filter_files_with_report(
                    relative_paths, filtering_options
                )
            else:
                filtered_paths = relative_paths
                ignored_count = 0

            # Convert back to absolute paths
            filtered_absolute_paths = [
                os.path.join(target_dir, p) for p in filtered_paths
            ]

            # Create GlobEntry objects and sort by modification time
            entries = []
            for abs_path in filtered_absolute_paths:
                path_obj = Path(abs_path)
                entries.append(GlobEntry.from_path(path_obj))

            # Sort by modification time (newest first)
            entries.sort(key=lambda x: x.modified_time, reverse=True)

            # Create output
            file_list = "\n".join([entry.path for entry in entries])

            search_location = f"within {search_dir}" if args.path else "across workspace"
            content = (
                f'Found {len(entries)} file(s) matching "{args.pattern}" {search_location}'
                f"{f' ({ignored_count} additional files were ignored)' if ignored_count > 0 else ''}, "
                "sorted by modification time (newest first):\n"
                f"{file_list}"
            )

            return {
                "entries": [
                    {
                        "path": e.path,
                        "size": e.size,
                        "modified_time": e.modified_time
                    }
                    for e in entries
                ],
                "llm_content": content,
                "return_display": f"Found {len(entries)} matching file(s)"
            }

        except Exception as e:
            logger.error(f"Unexpected error in glob: {e}", exc_info=True)
            return {
                "error": f"Unexpected error: {str(e)}",
                "llm_content": f"Error: Unexpected error: {str(e)}"
            }
