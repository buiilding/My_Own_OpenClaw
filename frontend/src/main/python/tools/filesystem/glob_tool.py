"""
Glob Tool - Python implementation.

Finds files matching glob patterns with gitignore filtering.
"""

import asyncio
import logging
import os
from dataclasses import dataclass
from glob import glob as glob_module
from pathlib import Path
from typing import Dict, Any

from tools.result import ToolResult
from tools.filesystem.gitignore_utils import load_gitignore, is_ignored

logger = logging.getLogger(__name__)


@dataclass
class GlobEntry:
    """Represents a file found by glob."""
    path: str
    size: int
    modified_time: float
    
    @classmethod
    def from_path(cls, path: Path) -> "GlobEntry":
        """Create GlobEntry from Path object."""
        stat = path.stat()
        return cls(
            path=str(path),
            size=stat.st_size,
            modified_time=stat.st_mtime,
        )


async def glob(args: Dict[str, Any]) -> ToolResult:
    """
    Find files matching glob patterns.
    
    Args:
        args: Dict with pattern, path, case_sensitive
        
    Returns:
        ToolResult with matching files sorted by modification time
    """
    try:
        pattern = args.get("pattern")
        search_path = args.get("path")

        if not isinstance(pattern, str) or not pattern:
            return ToolResult.error_result("pattern parameter is required")
        if search_path is not None and not isinstance(search_path, str):
            return ToolResult.error_result("path parameter must be a string")
        
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
        
        # Perform glob search
        try:
            glob_pattern = os.path.join(search_dir, pattern)
            matches = glob_module(glob_pattern, recursive=True)
            
            # Filter out directories
            file_matches = [m for m in matches if os.path.isfile(m)]
        except Exception as e:
            return ToolResult.error_result(f"Glob search failed: {e}")
        
        if not file_matches:
            content = f'No files found matching pattern "{pattern}" within {search_dir}'
            return ToolResult.success_result({
                "entries": [],
                "llm_content": content,
            })
        
        # Load gitignore for filtering
        gitignore_spec = load_gitignore(search_dir)
        
        # Filter files using gitignore
        filtered_files = []
        for file_path in file_matches:
            # Get relative path from search directory
            try:
                rel_path = os.path.relpath(file_path, search_dir)
                # Normalize path separators
                rel_path = rel_path.replace('\\', '/')
                
                # Check gitignore
                if gitignore_spec and is_ignored(rel_path, gitignore_spec):
                    continue
                
                filtered_files.append(file_path)
            except Exception:
                # Skip files we can't process
                continue
        
        # Create GlobEntry objects and sort by modification time
        entries = []
        for abs_path in filtered_files:
            try:
                path_obj = Path(abs_path)
                entries.append(GlobEntry.from_path(path_obj))
            except Exception as e:
                logger.debug(f"Error processing file {abs_path}: {e}")
                continue
        
        # Sort by modification time (newest first)
        entries.sort(key=lambda x: x.modified_time, reverse=True)
        
        # Create output
        file_list = "\n".join([entry.path for entry in entries])
        
        search_location = f"within {search_dir}" if search_path else "across workspace"
        ignored_count = len(file_matches) - len(entries)
        
        content = (
            f'Found {len(entries)} file(s) matching "{pattern}" {search_location}'
            f"{f' ({ignored_count} additional files were ignored)' if ignored_count > 0 else ''}, "
            "sorted by modification time (newest first):\n"
            f"{file_list}"
        )
        
        return ToolResult.success_result({
            "entries": [
                {
                    "path": e.path,
                    "size": e.size,
                    "modified_time": e.modified_time,
                }
                for e in entries
            ],
            "llm_content": content,
        })
    
    except Exception as e:
        logger.error(f"Unexpected error in glob: {e}", exc_info=True)
        return ToolResult.error_result(f"Unexpected error: {str(e)}")
