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

DEFAULT_LINE_LIMIT = 2000
MAX_LINE_LENGTH = 500


def _truncate_line_preserving_ending(line: str) -> tuple[str, bool]:
    """Truncate a line body while preserving its original line ending."""
    if line.endswith("\r\n"):
        line_body = line[:-2]
        line_ending = "\r\n"
    elif line.endswith("\n") or line.endswith("\r"):
        line_body = line[:-1]
        line_ending = line[-1]
    else:
        line_body = line
        line_ending = ""

    if len(line_body) <= MAX_LINE_LENGTH:
        return line, False

    return f"{line_body[:MAX_LINE_LENGTH]}{line_ending}", True


async def read_file(args: Dict[str, Any]) -> ToolResult:
    """
    Read file contents with binary detection and line-based pagination.
    
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
        
        # Detect encoding
        encoding = detect_encoding(str(path))

        start = offset if offset is not None else 0
        line_limit = limit if limit is not None else DEFAULT_LINE_LIMIT

        if not isinstance(start, int) or start < 0:
            return ToolResult.error_result("offset must be a non-negative integer")
        if not isinstance(line_limit, int) or line_limit <= 0:
            return ToolResult.error_result("limit must be a positive integer")

        def _read_file_window() -> tuple[list[str], int, int]:
            collected_lines: list[str] = []
            total_lines = 0
            truncated_line_count = 0

            with path.open(encoding=encoding or "utf-8", errors="replace", newline="") as handle:
                for raw_line in handle:
                    total_lines += 1
                    if total_lines <= start:
                        continue
                    if len(collected_lines) >= line_limit:
                        continue

                    truncated_line, did_truncate = _truncate_line_preserving_ending(raw_line)
                    if did_truncate:
                        truncated_line_count += 1
                    collected_lines.append(truncated_line)

            return collected_lines, total_lines, truncated_line_count

        loop = asyncio.get_running_loop()
        content_lines, total_lines, truncated_line_count = await loop.run_in_executor(None, _read_file_window)

        effective_start = min(start, total_lines)
        end = min(effective_start + line_limit, total_lines)

        content_text = "".join(content_lines)
        is_truncated = effective_start > 0 or end < total_lines

        llm_header = f"File path: {path}\n\n"

        # Build llm_content with exact SDK format if truncated
        if is_truncated:
            lines_shown = len(content_lines)
            next_offset = end

            if lines_shown > 0:
                status_line = (
                    f"Status: Showing lines {effective_start + 1}-{effective_start + lines_shown} "
                    f"of {total_lines} total lines.\n"
                )
            else:
                status_line = (
                    f"Status: Showing 0 lines at or after line {start + 1} of {total_lines} total lines.\n"
                )

            truncation_note = ""
            if truncated_line_count > 0:
                truncation_note = (
                    f"Note: {truncated_line_count} line(s) were truncated to {MAX_LINE_LENGTH} characters.\n"
                )
            
            llm_content = (
                f"{llm_header}"
                "IMPORTANT: The file content has been truncated.\n"
                f"{status_line}"
                "Action: To read more of the file, you can use the 'offset' and 'limit' parameters in a subsequent 'read_file' call. "
                f"For example, to read the next section of the file, use offset: {next_offset}.\n\n"
                f"{truncation_note}"
                "--- FILE CONTENT (truncated) ---\n"
                f"{content_text}"
            )
        else:
            if truncated_line_count > 0:
                llm_content = (
                    f"{llm_header}"
                    f"Note: {truncated_line_count} line(s) were truncated to {MAX_LINE_LENGTH} characters.\n\n"
                    f"{content_text}"
                )
            else:
                if content_text:
                    llm_content = f"{llm_header}{content_text}"
                else:
                    llm_content = f"{llm_header}File is empty."
        
        return ToolResult.success_result({
            "content": content_text,
            "file_path": str(path),
            "total_lines": total_lines,
            "read_lines": len(content_lines),
            "is_truncated": is_truncated,
            "line_truncation_limit": MAX_LINE_LENGTH,
            "truncated_line_count": truncated_line_count,
            "llm_content": llm_content,
        })
    except Exception as e:
        logger.error(f"Error reading file: {e}", exc_info=True)
        return ToolResult.error_result(f"Failed to read file: {str(e)}")
