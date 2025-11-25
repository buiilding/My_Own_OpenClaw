"""
Search File Content Tool (SDK Version).

Tool for searching regex patterns within file contents.
"""
import asyncio
import logging
import os
import re
import subprocess
from glob import glob as glob_module
from typing import List, Optional
from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context
from backend.src.tools.filesystem.data_structures import GrepMatch
from backend.src.tools.system.shell_tool import ShellTool
from backend.src.core.utils.file_utils import (
    is_text_file,
    make_relative_path,
    read_text_file_auto_encoding,
)

logger = logging.getLogger(__name__)


class SearchFileContentArgs(BaseModel):
    pattern: str = Field(..., description="Regular expression pattern to search for")
    path: Optional[str] = Field(None, description="Directory path to search in (defaults to current working directory)")
    include: Optional[str] = Field(None, description="Glob pattern to filter files (e.g., '*.py')")


class SearchFileContentTool(Tool[SearchFileContentArgs]):
    """Tool for searching regex patterns within file contents."""
    
    name = "search_file_content"
    description = "Searches for a regular expression pattern within the content of files in a specified directory. Can filter files by a glob pattern. Returns the lines containing matches, along with their file paths and line numbers."
    args_model = SearchFileContentArgs

    async def run(self, args: SearchFileContentArgs, ctx: Context) -> dict:
        """Execute the search_file_content tool."""
        try:
            if not args.pattern:
                return {
                    "error": "pattern parameter is required",
                    "llm_content": "Error: pattern parameter is required"
                }

            # Validate regex pattern
            try:
                re.compile(args.pattern)
            except re.error as e:
                return {
                    "error": f"Invalid regex pattern: {e}",
                    "llm_content": f"Error: Invalid regex pattern: {e}"
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

            # Perform search
            matches = await self._perform_search(
                search_dir, args.pattern, args.include, target_dir, ctx
            )

            if not matches:
                search_location = f'in path "{args.path}"' if args.path else "in workspace"
                filter_desc = f' (filter: "{args.include}")' if args.include else ""
                content = f'No matches found for pattern "{args.pattern}" {search_location}{filter_desc}.'

                return {
                    "matches": [],
                    "llm_content": content,
                    "return_display": "No matches found"
                }

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
            search_location = f'in path "{args.path}"' if args.path else "in workspace"
            filter_desc = f' (filter: "{args.include}")' if args.include else ""

            content = (
                f'Found {len(matches)} match(es) for pattern "{args.pattern}" '
                f"{search_location}{filter_desc}:\n---\n"
            )

            for file_path, file_matches in matches_by_file.items():
                content += f"File: {file_path}\n"
                for match in file_matches:
                    # Trim whitespace from the line for display
                    trimmed_line = match.line.rstrip()
                    content += f"L{match.line_number}: {trimmed_line}\n"
                content += "---\n"

            return {
                "matches": [{"file_path": m.file_path, "line_number": m.line_number, "line": m.line} for m in matches],
                "llm_content": content.rstrip(),
                "return_display": f"Found {len(matches)} match(es)"
            }

        except Exception as e:
            logger.error(f"Unexpected error in search_file_content: {e}", exc_info=True)
            return {
                "error": f"Unexpected error: {str(e)}",
                "llm_content": f"Error: Unexpected error: {str(e)}"
            }

    async def _perform_search(
        self, search_dir: str, pattern: str, include: Optional[str], target_dir: str, ctx: Context
    ) -> List[GrepMatch]:
        """Perform the actual search operation."""
        matches = []

        # Use git grep if available and in a git repository
        matches = await self._try_git_grep(search_dir, pattern, include, target_dir)
        if matches is not None:
            return matches

        # Fall back to manual file search
        return await self._manual_file_search(search_dir, pattern, include, target_dir, ctx)

    async def _try_git_grep(
        self, search_dir: str, pattern: str, include: Optional[str], target_dir: str
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
                    return self._parse_grep_output(
                        stdout.decode(), search_dir, target_dir
                    )
                else:
                    return []  # No matches
            else:
                # git grep failed, fall back to manual search
                return None

        except Exception:
            return None

    async def _manual_file_search(
        self, search_dir: str, pattern: str, include: Optional[str], target_dir: str, ctx: Context
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
        file_service = ctx.services.get("file_service")
        workspace_files = []

        for file_path in file_paths:
            if os.path.isfile(file_path):
                relative_path = make_relative_path(file_path, target_dir)
                filtering_options = {
                    "respect_git_ignore": True,
                    "respect_gemini_ignore": True,
                    "respect_gitignore": True,
                }

                if file_service:
                    filtered_paths, _ = file_service.filter_files_with_report(
                        [relative_path], filtering_options
                    )
                    if filtered_paths:
                        workspace_files.append(file_path)
                else:
                    # No file service, include all files
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
                                    file_path=make_relative_path(file_path, target_dir),
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

    def _parse_grep_output(
        self, output: str, search_dir: str, target_dir: str
    ) -> List[GrepMatch]:
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
                    rel_path = make_relative_path(abs_path, target_dir)

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
