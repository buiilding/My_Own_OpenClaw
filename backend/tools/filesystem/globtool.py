"""
Glob Tool.

Tool for glob.
"""

from .data_structures import GlobEntry
from backend.utils.file_utils import make_relative_path
from pathlib import Path
import os

logger = logging.getLogger(__name__)


class GlobTool(Tool):
    """Tool for finding files matching glob patterns."""

    def __init__(self, config: Any):
        super().__init__(
            name="glob",
            description="Efficiently finds files matching specific glob patterns (e.g., `src/**/*.ts`, `**/*.md`), returning absolute paths sorted by modification time (newest first). Ideal for quickly locating files based on their name or path structure, especially in large codebases.",
            kind=Kind.SEARCH,
        )
        self.config = config

    async def execute_async(
        self,
        context: ToolContext,
        pattern: str,
        path: Optional[str] = None,
        case_sensitive: Optional[bool] = None,
        respect_git_ignore: Optional[bool] = None,
        respect_gemini_ignore: Optional[bool] = None,
    ) -> ToolResult:
        """Execute the glob tool."""
        try:
            pattern = pattern
            path = path
            # case_sensitive = case_sensitive  # Reserved for future use
            respect_git_ignore = (
                respect_git_ignore if respect_git_ignore is not None else True
            )
            respect_gemini_ignore = (
                respect_gemini_ignore if respect_gemini_ignore is not None else True
            )

            if not pattern:
                return ToolResult(
                    success=False,
                    error="pattern parameter is required",
                    llm_content="Error: pattern parameter is required",
                    return_display="pattern parameter is required",
                )

            # Determine search directory
            if path:
                if not os.path.isabs(path):
                    search_dir = os.path.join(self.config.get_target_dir(), path)
                else:
                    search_dir = path
            else:
                search_dir = self.config.get_target_dir()

            # Validate search directory
            workspace_context = self.config.get_workspace_context()
            if not workspace_context.is_path_within_workspace(search_dir):
                return ToolResult(
                    success=False,
                    error=f"Search path not within workspace: {search_dir}",
                    llm_content=f"Error: Search path not within workspace: {search_dir}",
                    return_display="Search path not within workspace",
                )

            if not os.path.exists(search_dir):
                return ToolResult(
                    success=False,
                    error=f"Search path does not exist: {search_dir}",
                    llm_content=f"Error: Search path does not exist: {search_dir}",
                    return_display="Search path does not exist",
                )

            if not os.path.isdir(search_dir):
                return ToolResult(
                    success=False,
                    error=f"Search path is not a directory: {search_dir}",
                    llm_content=f"Error: Search path is not a directory: {search_dir}",
                    return_display="Search path is not a directory",
                )

            # Perform glob search
            try:
                # Use glob with appropriate options
                glob_pattern = os.path.join(search_dir, pattern)
                matches = glob_module(glob_pattern, recursive=True)

                # Filter out directories
                file_matches = [m for m in matches if os.path.isfile(m)]

            except Exception as e:
                return ToolResult(
                    success=False,
                    error=f"Glob search failed: {e}",
                    llm_content=f"Error: Glob search failed: {e}",
                    return_display="Glob search failed",
                )

            if not file_matches:
                content = (
                    f'No files found matching pattern "{pattern}" within {search_dir}'
                )
                return ToolResult(
                    success=True,
                    data=[],
                    llm_content=content,
                    return_display="No files found",
                )

            # Apply file filtering
            file_discovery = self.config.get_file_service()
            relative_paths = [
                make_relative_path(p, self.config.get_target_dir())
                for p in file_matches
            ]

            filtering_options = {
                "respect_git_ignore": respect_git_ignore,
                "respect_gemini_ignore": respect_gemini_ignore,
            }

            filtered_paths, ignored_count = file_discovery.filter_files_with_report(
                relative_paths, filtering_options
            )

            # Convert back to absolute paths
            filtered_absolute_paths = [
                os.path.join(self.config.get_target_dir(), p) for p in filtered_paths
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

            search_location = f"within {search_dir}" if path else "across workspace"
            content = (
                f'Found {len(entries)} file(s) matching "{pattern}" {search_location}'
                f"{f' ({ignored_count} additional files were ignored)' if ignored_count > 0 else ''}, "
                "sorted by modification time (newest first):\n"
                f"{file_list}"
            )

            return ToolResult(
                success=True,
                data=entries,
                llm_content=content,
                return_display=f"Found {len(entries)} matching file(s)",
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected error: {str(e)}",
                return_display="Unexpected error occurred",
            )


