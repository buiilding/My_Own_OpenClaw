"""
Read File Tool - Python implementation.
"""

import asyncio
import logging
from pathlib import Path
from typing import Dict, Any

from tools.result import ToolResult
from tools.filesystem.file_utils import is_binary_file, detect_encoding

logger = logging.getLogger(__name__)

# Maximum file size to read (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024


async def read_file(args: Dict[str, Any]) -> ToolResult:
    """
    Read file contents with binary detection, size limits, and pagination.
    
    Args:
        args: Dictionary with 'file_path', optional 'offset', 'limit'
        
    Returns:
        ToolResult with file data and standardized truncation messages
    """
    file_path = args.get("file_path")
    offset = args.get("offset")
    limit = args.get("limit")
    
    try:
        path = Path(file_path)
        
        # Validate absolute path
        if not path.is_absolute():
            return ToolResult.error_result(f"File path must be absolute: {file_path}")
        
        # Check if file exists
        if not path.exists():
            return ToolResult.error_result(f"File not found: {file_path}")
        
        if not path.is_file():
            return ToolResult.error_result(f"Not a file: {file_path}")
        
        # Check if binary file
        if is_binary_file(str(path)):
            return ToolResult.error_result(
                f"File appears to be binary and cannot be read as text: {file_path}"
            )
        
        # Check file size
        file_size = path.stat().st_size
        if file_size > MAX_FILE_SIZE:
            return ToolResult.error_result(
                f"File too large ({file_size / (1024*1024):.1f}MB). "
                f"Maximum size is {MAX_FILE_SIZE / (1024*1024)}MB. "
                f"Use offset and limit parameters to read in chunks."
            )
        
        # Detect encoding
        encoding = detect_encoding(str(path))
        
        # Read file
        def _read_file():
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                # Try UTF-8 with error handling
                return path.read_text(encoding='utf-8', errors='replace')
        
        loop = asyncio.get_event_loop()
        content = await loop.run_in_executor(None, _read_file)
        
        # Split into lines (preserve line endings for accurate line counting)
        lines = content.splitlines(keepends=True)
        if not lines and content:  # Handle files without newlines
            lines = [content]
        
        total_lines = len(lines)
        
        # Apply offset and limit
        start = offset if offset is not None else 0
        if limit is not None:
            end = start + limit
        else:
            end = total_lines
        
        # Clamp to valid range
        start = max(0, min(start, total_lines))
        end = max(start, min(end, total_lines))
        
        content_lines = lines[start:end]
        content_text = "".join(content_lines)  # Preserve original line endings
        
        # Check if truncated
        is_truncated = start > 0 or end < total_lines
        
        # Build llm_content with exact SDK format if truncated
        if is_truncated:
            lines_shown = len(content_lines)
            next_offset = end
            
            llm_content = (
                "IMPORTANT: The file content has been truncated.\n"
                f"Status: Showing lines {start + 1}-{start + lines_shown} of {total_lines} total lines.\n"
                "Action: To read more of the file, you can use the 'offset' and 'limit' parameters in a subsequent 'read_file' call. "
                f"For example, to read the next section of the file, use offset: {next_offset}.\n\n"
                "--- FILE CONTENT (truncated) ---\n"
                f"{content_text}"
            )
        else:
            llm_content = content_text or "File is empty."
        
        return ToolResult.success_result({
            "content": content_text,
            "file_path": str(path),
            "total_lines": total_lines,
            "read_lines": len(content_lines),
            "is_truncated": is_truncated,
            "llm_content": llm_content,
        })
    except Exception as e:
        logger.error(f"Error reading file: {e}", exc_info=True)
        return ToolResult.error_result(f"Failed to read file: {str(e)}")
