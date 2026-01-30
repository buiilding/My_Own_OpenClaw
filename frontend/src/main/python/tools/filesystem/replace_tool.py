"""
Replace Tool - Python implementation.

Performs surgical find-and-replace operations with line ending normalization.
"""

import asyncio
import logging
import os
from pathlib import Path
from typing import Dict, Any

from tools.result import ToolResult
from tools.schemas import ReplaceArgs

logger = logging.getLogger(__name__)

# Default encoding
DEFAULT_ENCODING = 'utf-8'


def _normalize_line_endings(text: str) -> str:
    """
    Normalize line endings to \n (Unix style).
    
    Args:
        text: Text with potentially mixed line endings
        
    Returns:
        Text with normalized line endings
    """
    # Replace \r\n (Windows) and \r (old Mac) with \n
    return text.replace('\r\n', '\n').replace('\r', '\n')


def _normalize_whitespace(text: str) -> str:
    """
    Normalize whitespace by stripping trailing whitespace from each line.
    
    Args:
        text: Text to normalize
        
    Returns:
        Text with normalized whitespace
    """
    lines = text.split('\n')
    normalized_lines = [line.rstrip() for line in lines]
    return '\n'.join(normalized_lines)


def _perform_replacement(
    content: str,
    old_string: str,
    new_string: str,
    replace_all: bool
) -> tuple[str, int]:
    """
    Perform the actual replacement operation with line ending normalization.
    
    Args:
        content: File content
        old_string: String to find
        new_string: Replacement string
        replace_all: If True, replace all occurrences; if False, replace first only
        
    Returns:
        Tuple of (new_content, replacement_count)
    """
    # Normalize line endings in both content and old_string
    normalized_content = _normalize_line_endings(content)
    normalized_old = _normalize_line_endings(old_string)
    
    # Count occurrences
    count = normalized_content.count(normalized_old)
    
    if count == 0:
        # Try with whitespace normalization as fallback
        normalized_content_ws = _normalize_whitespace(normalized_content)
        normalized_old_ws = _normalize_whitespace(normalized_old)
        count_ws = normalized_content_ws.count(normalized_old_ws)
        
        if count_ws > 0:
            # Use whitespace-normalized version
            if replace_all:
                new_content = normalized_content_ws.replace(normalized_old_ws, new_string, -1)
            else:
                new_content = normalized_content_ws.replace(normalized_old_ws, new_string, 1)
            # Restore original line endings structure (approximate)
            return new_content, count_ws if replace_all else min(count_ws, 1)
        
        return content, 0
    
    # Validate uniqueness when replace_all=False
    if not replace_all and count > 1:
        return content, count  # Return count > 1 to signal multiple matches
    
    # Perform replacement
    if replace_all:
        replace_count = count
        new_content = normalized_content.replace(normalized_old, new_string, -1)
    else:
        replace_count = 1
        new_content = normalized_content.replace(normalized_old, new_string, 1)
    
    # Preserve original line ending style if possible
    # For now, we'll use \n (Unix style) which is standard
    return new_content, replace_count


async def replace(args: ReplaceArgs) -> ToolResult:
    """
    Replace text in a file with line ending normalization.
    
    Args:
        args: ReplaceArgs with file_path, old_string, new_string, replace_all
        
    Returns:
        ToolResult with replacement count
    """
    try:
        file_path = args.file_path
        old_string = args.old_string
        new_string = args.new_string
        replace_all = args.replace_all
        
        path = Path(file_path)
        
        # Validate absolute path
        if not path.is_absolute():
            return ToolResult.error_result(f"File path must be absolute: {file_path}")
        
        # Handle file creation case
        file_exists = path.exists()
        if not file_exists:
            if not old_string:
                # Create new file
                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with open(path, 'w', encoding=DEFAULT_ENCODING) as f:
                        f.write(new_string)
                    return ToolResult.success_result({
                        "replacements": 1,
                        "is_new_file": True,
                        "llm_content": f"Created new file: {file_path} with provided content.",
                    })
                except OSError as e:
                    return ToolResult.error_result(f"Failed to create file: {e}")
            else:
                return ToolResult.error_result(
                    f"File does not exist and old_string is not empty: {file_path}"
                )
        
        # Read current file content
        def _read_file():
            try:
                return path.read_text(encoding=DEFAULT_ENCODING)
            except UnicodeDecodeError:
                # Try with error handling
                return path.read_text(encoding=DEFAULT_ENCODING, errors='replace')
        
        loop = asyncio.get_event_loop()
        current_content = await loop.run_in_executor(None, _read_file)
        
        # Perform replacement
        new_content, replacements = _perform_replacement(
            current_content, old_string, new_string, replace_all
        )
        
        if replacements == 0:
            return ToolResult.error_result(
                "Failed to edit, could not find the string to replace. "
                "Please verify the exact text exists in the file."
            )
        
        if not replace_all and replacements > 1:
            return ToolResult.error_result(
                "Multiple matches found. Provide more unique context around the specific text you want to replace. "
                f"Found {replacements} occurrences. Use replace_all=true to replace all, or provide more context to make the match unique."
            )
        
        # Write back the modified content
        def _write_file():
            path.write_text(new_content, encoding=DEFAULT_ENCODING)
        
        await loop.run_in_executor(None, _write_file)
        
        return ToolResult.success_result({
            "replacements": replacements,
            "is_new_file": False,
            "llm_content": f"Successfully modified file: {file_path} ({replacements} replacement(s)).",
        })
    
    except Exception as e:
        logger.error(f"Unexpected error in replace: {e}", exc_info=True)
        return ToolResult.error_result(f"Unexpected error: {str(e)}")
