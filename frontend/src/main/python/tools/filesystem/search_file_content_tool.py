"""
Search File Content Tool - Python implementation.

Searches for regex patterns in file contents with git grep fallback and match limit.
"""

import asyncio
import logging
import os
import re
import subprocess
from dataclasses import dataclass
from glob import glob as glob_module
from pathlib import Path
from typing import Dict, Any, List, Optional

from tools.result import ToolResult
from tools.schemas import SearchFileContentArgs
from tools.filesystem.file_utils import is_text_file

logger = logging.getLogger(__name__)

# Maximum number of matches to return (prevent context window explosion)
MAX_MATCHES = 500


@dataclass
class GrepMatch:
    """Represents a single grep match."""
    file_path: str
    line_number: int
    line: str


def _is_git_repository(path: str) -> bool:
    """
    Check if a path is within a git repository.
    
    Args:
        path: Directory path to check
        
    Returns:
        True if path is in a git repository
    """
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


async def _try_git_grep(
    search_dir: str,
    pattern: str,
    include: Optional[str]
) -> Optional[List[GrepMatch]]:
    """
    Try to use git grep for faster searching.
    
    Args:
        search_dir: Directory to search in
        pattern: Regex pattern to search for
        include: Optional glob pattern to filter files
        
    Returns:
        List of GrepMatch objects if successful, None otherwise
    """
    try:
        # Check if we're in a git repository
        if not _is_git_repository(search_dir):
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
                return _parse_grep_output(stdout.decode(), search_dir)
            else:
                return []  # No matches
        else:
            # git grep failed, fall back to manual search
            return None
    
    except Exception as e:
        logger.debug(f"git grep failed: {e}")
        return None


def _parse_grep_output(output: str, search_dir: str) -> List[GrepMatch]:
    """
    Parse git grep output into GrepMatch objects.
    
    Args:
        output: Git grep output
        search_dir: Base search directory
        
    Returns:
        List of GrepMatch objects
    """
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
                
                # Convert to absolute path
                abs_path = os.path.join(search_dir, file_path)
                abs_path = os.path.normpath(abs_path)
                
                matches.append(GrepMatch(
                    file_path=abs_path,
                    line_number=line_number,
                    line=line_content,
                ))
            except ValueError:
                continue
    
    return matches


async def _manual_file_search(
    search_dir: str,
    pattern: str,
    include: Optional[str]
) -> List[GrepMatch]:
    """
    Perform manual file search as fallback.
    
    Args:
        search_dir: Directory to search in
        pattern: Regex pattern to search for
        include: Optional glob pattern to filter files
        
    Returns:
        List of GrepMatch objects
    """
    matches = []
    
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        logger.error(f"Invalid regex pattern: {e}")
        return []
    
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
    
    # Filter to text files only
    text_files = [fp for fp in file_paths if os.path.isfile(fp) and is_text_file(fp)]
    
    # Search each file
    for file_path in text_files:
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
            
            for line_num, line in enumerate(lines, 1):
                if regex.search(line):
                    matches.append(GrepMatch(
                        file_path=file_path,
                        line_number=line_num,
                        line=line.rstrip('\n\r'),
                    ))
                    
                    # Enforce match limit
                    if len(matches) >= MAX_MATCHES:
                        return matches
        except Exception as e:
            logger.debug(f"Error searching file {file_path}: {e}")
            continue
    
    return matches


async def search_file_content(args: SearchFileContentArgs) -> ToolResult:
    """
    Search for regex patterns in file contents.
    
    Args:
        args: SearchFileContentArgs with pattern, path, include
        
    Returns:
        ToolResult with matches grouped by file
    """
    try:
        pattern = args.pattern
        search_path = args.path
        include = args.include
        
        # Validate regex pattern
        try:
            re.compile(pattern)
        except re.error as e:
            return ToolResult.error_result(f"Invalid regex pattern: {e}")
        
        # Determine search directory
        if search_path:
            if os.path.isabs(search_path):
                search_dir = search_path
            else:
                # Relative to current working directory
                search_dir = os.path.join(os.getcwd(), search_path)
        else:
            search_dir = os.getcwd()
        
        if not os.path.exists(search_dir):
            return ToolResult.error_result(f"Search path does not exist: {search_dir}")
        
        if not os.path.isdir(search_dir):
            return ToolResult.error_result(f"Search path is not a directory: {search_dir}")
        
        # Try git grep first
        matches = await _try_git_grep(search_dir, pattern, include)
        
        # Fall back to manual search if git grep unavailable
        if matches is None:
            matches = await _manual_file_search(search_dir, pattern, include)
        
        # Check if limit exceeded
        limit_exceeded = len(matches) >= MAX_MATCHES
        if limit_exceeded:
            matches = matches[:MAX_MATCHES]
        
        if not matches:
            search_location = f'in path "{search_path}"' if search_path else "in workspace"
            filter_desc = f' (filter: "{include}")' if include else ""
            content = f'No matches found for pattern "{pattern}" {search_location}{filter_desc}.'
            
            return ToolResult.success_result({
                "matches": [],
                "llm_content": content,
            })
        
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
        search_location = f'in path "{search_path}"' if search_path else "in workspace"
        filter_desc = f' (filter: "{include}")' if include else ""
        
        content_parts = [
            f'Found {len(matches)} match(es) for pattern "{pattern}" '
            f"{search_location}{filter_desc}:\n---\n"
        ]
        
        if limit_exceeded:
            content_parts.append(
                f"Found 500+ matches, showing first 500. Please refine your search pattern.\n---\n"
            )
        
        for file_path, file_matches in matches_by_file.items():
            content_parts.append(f"File: {file_path}\n")
            for match in file_matches:
                trimmed_line = match.line.rstrip()
                content_parts.append(f"L{match.line_number}: {trimmed_line}\n")
            content_parts.append("---\n")
        
        content = "".join(content_parts).rstrip()
        
        return ToolResult.success_result({
            "matches": [
                {
                    "file_path": m.file_path,
                    "line_number": m.line_number,
                    "line": m.line,
                }
                for m in matches
            ],
            "llm_content": content,
        })
    
    except Exception as e:
        logger.error(f"Unexpected error in search_file_content: {e}", exc_info=True)
        return ToolResult.error_result(f"Unexpected error: {str(e)}")
