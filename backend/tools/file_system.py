"""
File System Tools for the Desktop Assistant.

This module implements all file system related tools:
- list_directory: Lists files and directories
- read_file: Reads text files, images, PDFs with optional line ranges
- write_file: Creates/overwrites files with content
- glob: Finds files matching glob patterns
- search_file_content: Searches for regex patterns in files
- replace: Search/replace text in files with fuzzy matching
- read_many_files: Reads multiple files by paths/glob patterns
"""

import asyncio
import logging
import os
import re
import subprocess
from dataclasses import dataclass
from glob import glob as glob_module
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

from backend.tools.base import Kind, Tool, ToolContext, ToolResult
from backend.utils.file_utils import (
    DEFAULT_ENCODING,
    FileType,
    detect_file_type,
    ensure_directory_exists,
    get_specific_mime_type,
    is_text_file,
    make_relative_path,
    read_file_content,
    read_text_file_auto_encoding,
    shorten_path,
)

# --- Data Structures ---


@dataclass
class FileEntry:
    """File entry returned by list_directory tool."""

    name: str
    path: str
    is_directory: bool
    size: int
    modified_time: float

    @classmethod
    def from_path(cls, path: Path) -> "FileEntry":
        """Create a FileEntry from a Path object."""
        try:
            stat_info = path.stat()
            is_dir = path.is_dir()
            return cls(
                name=path.name,
                path=str(path),
                is_directory=is_dir,
                size=0 if is_dir else stat_info.st_size,
                modified_time=stat_info.st_mtime,
            )
        except OSError:
            # If we can't stat the file, create a basic entry
            # Try to determine if it's a directory, but fall back to False if we can't
            try:
                is_dir = path.is_dir()
            except:
                is_dir = False
            return cls(
                name=path.name,
                path=str(path),
                is_directory=is_dir,
                size=0,
                modified_time=0,
            )


@dataclass
class GlobEntry:
    """Entry returned by glob tool."""

    path: str
    size: int
    modified_time: float

    @classmethod
    def from_path(cls, path: Path) -> "GlobEntry":
        """Create a GlobEntry from a Path object."""
        try:
            stat_info = path.stat()
            return cls(
                path=str(path), size=stat_info.st_size, modified_time=stat_info.st_mtime
            )
        except OSError:
            return cls(path=str(path), size=0, modified_time=0)


@dataclass
class GrepMatch:
    """Match result from search_file_content tool."""

    file_path: str
    line_number: int
    line: str


@dataclass
class ProcessedFileResult:
    """Result of processing a single file."""

    success: bool
    file_path: str
    relative_path: str
    content: Optional[str] = None
    error: Optional[str] = None
    is_truncated: bool = False


# --- List Directory Tool ---


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
            path = path
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

            # Validate path is absolute
            logger.info(
                f"ListDirectory: Path is absolute check: {os.path.isabs(path)} for path: {path}"
            )
            if not os.path.isabs(path):
                logger.error(f"ListDirectory: Path is not absolute: {path}")
                return ToolResult(
                    success=False,
                    error=f"Path must be absolute: {path}",
                    llm_content=f"Error: Path must be absolute: {path}",
                    return_display=f"Path must be absolute: {path}",
                )

            # Check if path is within workspace
            logger.info("ListDirectory: About to get workspace context")
            workspace_context = self.config.get_workspace_context()
            logger.info(f"ListDirectory: Got workspace context: {workspace_context}")
            logger.info(f"ListDirectory: Checking if path is within workspace: {path}")
            is_within_workspace = workspace_context.is_path_within_workspace(path)
            logger.info(f"ListDirectory: is_within_workspace={is_within_workspace}")
            if not is_within_workspace:
                logger.error(f"ListDirectory: Path is not within workspace: {path}")
                return ToolResult(
                    success=False,
                    error=f"Path is not within workspace: {path}",
                    llm_content=f"Error: Path is not within workspace: {path}",
                    return_display=f"Path is not within workspace: {path}",
                )

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
            logger.info(f"ListDirectory: Target dir: {self.config.get_target_dir()}")
            relative_paths = [
                make_relative_path(p, self.config.get_target_dir()) for p in full_paths
            ]
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
                relative_path = make_relative_path(
                    full_path, self.config.get_target_dir()
                )
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
                path_obj = Path(full_path)
                file_entries.append(FileEntry.from_path(path_obj))

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


# --- Read File Tool ---


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
            offset = offset
            limit = limit

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
            workspace_context = self.config.get_workspace_context()
            logger.info(f"ReadFile: Got workspace context: {workspace_context}")
            project_temp_dir = self.config.storage.get_project_temp_dir()
            logger.info(f"ReadFile: Temp dir: {project_temp_dir}")

            is_within_workspace = workspace_context.is_path_within_workspace(
                absolute_path
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


# --- Write File Tool ---


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
            file_path = file_path
            content = content

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

            # Check if path is within workspace
            workspace_context = self.config.get_workspace_context()
            if not workspace_context.is_path_within_workspace(file_path):
                return ToolResult(
                    success=False,
                    error=f"File path must be within workspace: {file_path}",
                    llm_content=f"Error: File path must be within workspace: {file_path}",
                    return_display="File path not within workspace",
                )

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
                return_display=f"{'Created' if is_new_file else 'Updated'} file: {shorten_path(make_relative_path(file_path, self.config.get_target_dir()))}",
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected error: {str(e)}",
                return_display="Unexpected error occurred",
            )


# --- Glob Tool ---


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


# --- Search File Content Tool (Grep) ---


class SearchFileContentTool(Tool):
    """Tool for searching regex patterns within file contents."""

    def __init__(self, config: Any):
        super().__init__(
            name="search_file_content",
            description="Searches for a regular expression pattern within the content of files in a specified directory. Can filter files by a glob pattern. Returns the lines containing matches, along with their file paths and line numbers.",
            kind=Kind.SEARCH,
        )
        self.config = config

    async def execute_async(
        self,
        context: ToolContext,
        pattern: str,
        path: Optional[str] = None,
        include: Optional[str] = None,
    ) -> ToolResult:
        """Execute the search_file_content tool."""
        try:
            pattern = pattern
            path = path
            include = include

            if not pattern:
                return ToolResult(
                    success=False,
                    error="pattern parameter is required",
                    llm_content="Error: pattern parameter is required",
                    return_display="pattern parameter is required",
                )

            # Validate regex pattern
            try:
                re.compile(pattern)
            except re.error as e:
                return ToolResult(
                    success=False,
                    error=f"Invalid regex pattern: {e}",
                    llm_content=f"Error: Invalid regex pattern: {e}",
                    return_display="Invalid regex pattern",
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

            # Perform search
            matches = await self._perform_search(search_dir, pattern, include)

            if not matches:
                search_location = f'in path "{path}"' if path else "in workspace"
                filter_desc = f' (filter: "{include}")' if include else ""
                content = f'No matches found for pattern "{pattern}" {search_location}{filter_desc}.'

                return ToolResult(
                    success=True,
                    data=[],
                    llm_content=content,
                    return_display="No matches found",
                )

            # Group matches by file
            matches_by_file = {}
            for match in matches:
                if match.file_path not in matches_by_file:
                    matches_by_file[match.file_path] = []
                matches_by_file[match.file_path].append(match)

            # Sort matches within each file by line number
            for file_matches in matches_by_file.values():
                file_matches.sort(key=lambda m: m.line_number)

            # Create output
            search_location = f'in path "{path}"' if path else "in workspace"
            filter_desc = f' (filter: "{include}")' if include else ""

            content = (
                f'Found {len(matches)} match(es) for pattern "{pattern}" '
                f"{search_location}{filter_desc}:\n---\n"
            )

            for file_path, file_matches in matches_by_file.items():
                content += f"File: {file_path}\n"
                for match in file_matches:
                    # Trim whitespace from the line for display
                    trimmed_line = match.line.rstrip()
                    content += f"L{match.line_number}: {trimmed_line}\n"
                content += "---\n"

            return ToolResult(
                success=True,
                data=matches,
                llm_content=content.rstrip(),
                return_display=f"Found {len(matches)} match(es)",
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected error: {str(e)}",
                return_display="Unexpected error occurred",
            )

    async def _perform_search(
        self, search_dir: str, pattern: str, include: Optional[str]
    ) -> List[GrepMatch]:
        """Perform the actual search operation."""
        matches = []

        # Use git grep if available and in a git repository
        matches = await self._try_git_grep(search_dir, pattern, include)
        if matches is not None:
            return matches

        # Fall back to manual file search
        return await self._manual_file_search(search_dir, pattern, include)

    async def _try_git_grep(
        self, search_dir: str, pattern: str, include: Optional[str]
    ) -> Optional[List[GrepMatch]]:
        """Try to use git grep for faster searching."""
        try:
            # Check if we're in a git repository
            if not self._is_git_repository(search_dir):
                return None

            # Check if git is available
            result = await asyncio.create_subprocess_exec(
                "git",
                "--version",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await result.wait()
            if result.returncode != 0:
                return None

            # Build git grep command
            cmd = ["git", "grep", "--untracked", "-n", "-E", "--ignore-case", pattern]
            if include:
                cmd.extend(["--", include])

            # Run git grep
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=search_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode in [0, 1]:  # 0 = matches found, 1 = no matches
                if process.returncode == 0:
                    return self._parse_grep_output(stdout.decode(), search_dir)
                else:
                    return []  # No matches
            else:
                # git grep failed, fall back to manual search
                return None

        except Exception:
            return None

    async def _manual_file_search(
        self, search_dir: str, pattern: str, include: Optional[str]
    ) -> List[GrepMatch]:
        """Perform manual file search as fallback."""
        matches = []
        regex = re.compile(pattern, re.IGNORECASE)

        # Find files to search
        if include:
            search_pattern = os.path.join(search_dir, include)
            file_paths = glob_module(search_pattern, recursive=True)
        else:
            # Search all files
            file_paths = []
            for root, dirs, files in os.walk(search_dir):
                # Skip common directories
                dirs[:] = [
                    d
                    for d in dirs
                    if not d.startswith(".")
                    and d not in ["node_modules", "__pycache__"]
                ]
                for file in files:
                    file_paths.append(os.path.join(root, file))

        # Filter to actual files and apply file filtering
        file_discovery = self.config.get_file_service()
        workspace_files = []

        for file_path in file_paths:
            if os.path.isfile(file_path):
                relative_path = make_relative_path(
                    file_path, self.config.get_target_dir()
                )
                filtering_options = {
                    "respect_git_ignore": True,
                    "respect_gemini_ignore": True,
                }

                filtered_paths, _ = file_discovery.filter_files_with_report(
                    [relative_path], filtering_options
                )
                if filtered_paths:
                    workspace_files.append(file_path)

        # Search each file
        for file_path in workspace_files:
            try:
                if is_text_file(file_path):
                    content, _ = read_text_file_auto_encoding(file_path)
                    lines = content.splitlines()

                    for line_num, line in enumerate(lines, 1):
                        if regex.search(line):
                            matches.append(
                                GrepMatch(
                                    file_path=make_relative_path(
                                        file_path, self.config.get_target_dir()
                                    ),
                                    line_number=line_num,
                                    line=line,
                                )
                            )
            except Exception:
                # Skip files that can't be read
                continue

        return matches

    def _is_git_repository(self, path: str) -> bool:
        """Check if a path is within a git repository."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--git-dir"],
                cwd=path,
                capture_output=True,
                text=True,
                timeout=5,
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False

    def _parse_grep_output(self, output: str, search_dir: str) -> List[GrepMatch]:
        """Parse grep output into GrepMatch objects."""
        matches = []

        for line in output.strip().split("\n"):
            if not line.strip():
                continue

            # Parse format: file_path:line_number:line_content
            parts = line.split(":", 2)
            if len(parts) >= 3:
                file_path = parts[0]
                try:
                    line_number = int(parts[1])
                    line_content = parts[2]

                    # Convert to relative path
                    abs_path = os.path.join(search_dir, file_path)
                    rel_path = make_relative_path(
                        abs_path, self.config.get_target_dir()
                    )

                    matches.append(
                        GrepMatch(
                            file_path=rel_path,
                            line_number=line_number,
                            line=line_content,
                        )
                    )
                except ValueError:
                    continue

        return matches


# --- Replace Tool ---


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
            file_path = file_path
            old_string = old_string
            new_string = new_string
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
                        return_display=f"Created new file: {shorten_path(make_relative_path(file_path, self.config.get_target_dir()))}",
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
                return_display=f"Modified file: {shorten_path(make_relative_path(file_path, self.config.get_target_dir()))} ({replacements} replacements)",
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
        # For now, use exact string matching
        # TODO: Implement fuzzy matching like Gemini CLI
        count = content.count(old_string)
        if count == 0:
            return content, 0

        if count != expected_count and expected_count != -1:  # -1 means replace all
            return content, count

        # Perform replacement
        replace_count = expected_count if expected_count > 0 else count
        new_content = content.replace(old_string, new_string, replace_count)

        return new_content, replace_count


# --- Read Many Files Tool ---


class ReadManyFilesTool(Tool):
    """Tool for reading multiple files by paths/glob patterns."""

    def __init__(self, config: Any):
        super().__init__(
            name="read_many_files",
            description="Reads content from multiple files specified by paths or glob patterns within a configured target directory. For text files, it concatenates their content into a single string. It is primarily designed for text-based files. However, it can also process image (e.g., .png, .jpg) and PDF (.pdf) files if their file names or extensions are explicitly included in the 'paths' argument.",
            kind=Kind.READ,
        )
        self.config = config

    async def execute_async(
        self,
        context: ToolContext,
        paths: List[str],
        include: Optional[List[str]] = None,
        exclude: Optional[List[str]] = None,
        useDefaultExcludes: Optional[bool] = None,
        file_filtering_options: Optional[Dict[str, Any]] = None,
    ) -> ToolResult:
        """Execute the read_many_files tool."""
        try:
            paths = paths
            include = include or []
            # exclude = exclude or []  # Reserved for future use
            # use_default_excludes = useDefaultExcludes if useDefaultExcludes is not None else True  # Reserved for future use
            file_filtering_options = file_filtering_options or {}

            if not paths:
                return ToolResult(
                    success=False,
                    error="paths parameter is required",
                    llm_content="Error: paths parameter is required",
                    return_display="paths parameter is required",
                )

            # Collect all file paths
            all_files = set()

            # Process direct paths and glob patterns
            search_patterns = paths + (include or [])

            for pattern in search_patterns:
                if os.path.isabs(pattern):
                    # Absolute path
                    if os.path.exists(pattern):
                        if os.path.isfile(pattern):
                            all_files.add(pattern)
                        elif os.path.isdir(pattern):
                            # For directories, add all files recursively
                            for root, dirs, files in os.walk(pattern):
                                for file in files:
                                    all_files.add(os.path.join(root, file))
                    else:
                        # Try as glob pattern
                        matches = glob_module(pattern, recursive=True)
                        all_files.update(matches)
                else:
                    # Relative path - resolve against workspace
                    full_pattern = os.path.join(self.config.get_target_dir(), pattern)
                    if os.path.exists(full_pattern):
                        if os.path.isfile(full_pattern):
                            all_files.add(full_pattern)
                        elif os.path.isdir(full_pattern):
                            for root, dirs, files in os.walk(full_pattern):
                                for file in files:
                                    all_files.add(os.path.join(root, file))
                    else:
                        # Try as glob pattern
                        matches = glob_module(full_pattern, recursive=True)
                        all_files.update(matches)

            # Apply workspace filtering
            workspace_context = self.config.get_workspace_context()
            workspace_files = []
            skipped_files = []

            for file_path in all_files:
                if workspace_context.is_path_within_workspace(file_path):
                    workspace_files.append(file_path)
                else:
                    skipped_files.append(
                        {
                            "path": make_relative_path(
                                file_path, self.config.get_target_dir()
                            ),
                            "reason": "Outside workspace boundaries",
                        }
                    )

            # Apply file filtering
            file_discovery = self.config.get_file_service()
            relative_paths = [
                make_relative_path(p, self.config.get_target_dir())
                for p in workspace_files
            ]

            filtering_options = {
                "respect_git_ignore": file_filtering_options.get(
                    "respect_git_ignore", True
                ),
                "respect_gemini_ignore": file_filtering_options.get(
                    "respect_gemini_ignore", True
                ),
            }

            filtered_paths, ignored_count = file_discovery.filter_files_with_report(
                relative_paths, filtering_options
            )

            if ignored_count > 0:
                skipped_files.append(
                    {
                        "path": f"{ignored_count} file(s)",
                        "reason": "ignored by project ignore files",
                    }
                )

            # Convert back to absolute paths
            filtered_absolute_paths = [
                os.path.join(self.config.get_target_dir(), p) for p in filtered_paths
            ]

            # Process files
            processed_files = []
            content_parts = []

            for file_path in filtered_absolute_paths:
                try:
                    file_type = detect_file_type(file_path)

                    # Handle image/PDF files specially
                    if file_type in [FileType.IMAGE, FileType.PDF]:
                        # Check if explicitly requested
                        explicitly_requested = any(
                            file_path.endswith(ext) or ext in file_path
                            for pattern in paths + (include or [])
                            for ext in [
                                ".png",
                                ".jpg",
                                ".jpeg",
                                ".gif",
                                ".webp",
                                ".svg",
                                ".bmp",
                                ".pdf",
                            ]
                        )

                        if not explicitly_requested:
                            skipped_files.append(
                                {
                                    "path": make_relative_path(
                                        file_path, self.config.get_target_dir()
                                    ),
                                    "reason": "asset file (image/pdf) was not explicitly requested by name or extension",
                                }
                            )
                            continue

                    # Read file content
                    content, error, is_truncated = read_file_content(file_path)

                    if error:
                        skipped_files.append(
                            {
                                "path": make_relative_path(
                                    file_path, self.config.get_target_dir()
                                ),
                                "reason": f"Read error: {error}",
                            }
                        )
                        continue

                    relative_path = make_relative_path(
                        file_path, self.config.get_target_dir()
                    )

                    if isinstance(content, str):
                        # Text file - add separator
                        separator = f"--- {file_path} ---"
                        file_content = content
                        if is_truncated:
                            file_content = f"[WARNING: This file was truncated. To view the full content, use the 'read_file' tool on this specific file.]\n\n{file_content}"

                        content_parts.append(f"{separator}\n\n{file_content}\n\n")
                    else:
                        # Binary file (image/PDF) - add without separator
                        content_parts.append(content)

                    processed_files.append(relative_path)

                except Exception as e:
                    skipped_files.append(
                        {
                            "path": make_relative_path(
                                file_path, self.config.get_target_dir()
                            ),
                            "reason": f"Unexpected error: {str(e)}",
                        }
                    )

            # Create output
            if content_parts:
                content_parts.append("--- End of content ---")
                llm_content = "".join(content_parts)
            else:
                llm_content = (
                    "No files matching the criteria were found or all were skipped."
                )

            # Create display message
            display_parts = [
                f"### ReadManyFiles Result (Target Dir: `{self.config.get_target_dir()}`)\n\n"
            ]

            if processed_files:
                display_parts.append(
                    f"Successfully read and concatenated content from **{len(processed_files)} file(s)**.\n"
                )

                if len(processed_files) <= 10:
                    display_parts.append("**Processed Files:**\n")
                    for file in processed_files:
                        display_parts.append(f"- `{file}`\n")
                else:
                    display_parts.append("**Processed Files (first 10 shown):**\n")
                    for file in processed_files[:10]:
                        display_parts.append(f"- `{file}`\n")
                    display_parts.append(
                        f"- ...and {len(processed_files) - 10} more.\n"
                    )

            if skipped_files:
                if len(skipped_files) <= 5:
                    display_parts.append(
                        f"\n**Skipped {len(skipped_files)} item(s):**\n"
                    )
                else:
                    display_parts.append(
                        f"\n**Skipped {len(skipped_files)} item(s) (first 5 shown):**\n"
                    )

                for skipped in skipped_files[:5]:
                    display_parts.append(
                        f"- `{skipped['path']}` (Reason: {skipped['reason']})\n"
                    )

                if len(skipped_files) > 5:
                    display_parts.append(f"- ...and {len(skipped_files) - 5} more.\n")

            return ToolResult(
                success=True,
                data={
                    "processed_files": processed_files,
                    "skipped_files": skipped_files,
                    "total_files_attempted": len(workspace_files),
                },
                llm_content=llm_content,
                return_display="".join(display_parts).rstrip(),
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected error: {str(e)}",
                return_display="Unexpected error occurred",
            )
