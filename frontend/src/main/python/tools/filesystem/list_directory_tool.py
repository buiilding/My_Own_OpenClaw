"""
List Directory Tool - Python implementation.

Filters out gitignore patterns and common build artifacts.
"""

import asyncio
import logging
import os
from pathlib import Path
from typing import Dict, Any, Set

from tools.result import ToolResult
from tools.filesystem.gitignore_utils import load_gitignore, is_ignored

logger = logging.getLogger(__name__)

# Common patterns to always filter
COMMON_IGNORE_PATTERNS: Set[str] = {
    '__pycache__',
    '.git',
    'node_modules',
    '.DS_Store',
    '.pytest_cache',
    '.mypy_cache',
    '.coverage',
    'dist',
    'build',
    '.venv',
    'venv',
    'env',
    '.env',
}


def _should_ignore(name: str, relative_path: str, gitignore_spec) -> bool:
    """
    Check if a file/directory should be ignored.
    
    Args:
        name: Item name
        relative_path: Relative path from directory root
        gitignore_spec: PathSpec object from gitignore
        
    Returns:
        True if item should be ignored
    """
    # Check common patterns
    if name in COMMON_IGNORE_PATTERNS:
        return True
    
    # Check if name starts with common ignore patterns
    if name.startswith('.') and name not in ['.', '..']:
        # Allow some common visible dotfiles
        visible_dotfiles = {'.gitignore', '.env.example', '.editorconfig'}
        if name not in visible_dotfiles:
            return True
    
    # Check gitignore
    if gitignore_spec:
        if is_ignored(relative_path, gitignore_spec):
            return True
    
    return False


async def list_directory(args: Dict[str, Any]) -> ToolResult:
    """
    List directory contents with gitignore filtering.
    
    Args:
        args: Dictionary with 'path'
        
    Returns:
        ToolResult with directory listing
    """
    dir_path = args.get("path")
    
    if not dir_path:
        return ToolResult.error_result("path is required")
    
    try:
        path = Path(dir_path)
        
        # Validate absolute path
        if not path.is_absolute():
            return ToolResult.error_result(f"Path must be absolute: {dir_path}")
        
        # Check if path exists
        if not path.exists():
            return ToolResult.error_result(f"Path not found: {dir_path}")
        
        if not path.is_dir():
            return ToolResult.error_result(f"Not a directory: {dir_path}")
        
        # Load gitignore
        gitignore_spec = load_gitignore(str(path))
        
        # List directory
        def _list_directory():
            items = []
            for item in sorted(path.iterdir()):
                try:
                    # Get relative path for gitignore checking
                    relative_path = os.path.relpath(str(item), str(path))
                    
                    # Check if should be ignored
                    if _should_ignore(item.name, relative_path, gitignore_spec):
                        continue
                    
                    if item.is_dir():
                        items.append(f"[DIR] {item.name}")
                    elif item.is_file():
                        items.append(f"[FILE] {item.name}")
                    else:
                        items.append(f"[UNKNOWN] {item.name}")
                except (PermissionError, OSError):
                    # Skip items we can't access
                    continue
            
            return items
        
        loop = asyncio.get_event_loop()
        formatted = await loop.run_in_executor(None, _list_directory)
        
        # Get item names for data
        item_names = [item.split("] ", 1)[1] if "] " in item else item for item in formatted]
        content = "\n".join(formatted) if formatted else "Directory is empty."
        
        return ToolResult.success_result({
            "path": str(path),
            "items": item_names,
            "llm_content": content,
        })
    except Exception as e:
        logger.error(f"Error listing directory: {e}", exc_info=True)
        return ToolResult.error_result(f"Failed to list directory: {str(e)}")
