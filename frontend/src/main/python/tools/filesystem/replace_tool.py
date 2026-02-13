"""
Replace Tool - Python implementation.

Performs surgical find-and-replace operations with line ending normalization.
"""

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, Any

from tools.result import ToolResult

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


def _normalize_for_lenient_line_match(text: str) -> str:
    """
    Normalize common punctuation and spacing for lenient line matching.
    """
    normalized = text.strip()
    translations = {
        # Dash variants
        '\u2010': '-',
        '\u2011': '-',
        '\u2012': '-',
        '\u2013': '-',
        '\u2014': '-',
        '\u2015': '-',
        '\u2212': '-',
        # Fancy single quotes
        '\u2018': "'",
        '\u2019': "'",
        '\u201A': "'",
        '\u201B': "'",
        # Fancy double quotes
        '\u201C': '"',
        '\u201D': '"',
        '\u201E': '"',
        '\u201F': '"',
        # Space variants
        '\u00A0': ' ',
        '\u2002': ' ',
        '\u2003': ' ',
        '\u2004': ' ',
        '\u2005': ' ',
        '\u2006': ' ',
        '\u2007': ' ',
        '\u2008': ' ',
        '\u2009': ' ',
        '\u200A': ' ',
        '\u202F': ' ',
        '\u205F': ' ',
        '\u3000': ' ',
    }
    return ''.join(translations.get(char, char) for char in normalized)


def _split_lines_for_matching(text: str) -> list[str]:
    """
    Split text into lines while removing the split() trailing sentinel.
    """
    lines = text.split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    return lines


def _seek_line_sequence(lines: list[str], pattern: list[str], start: int) -> int | None:
    """
    Find a line sequence using progressively lenient matching.
    """
    if not pattern:
        return start
    if len(pattern) > len(lines):
        return None

    upper_bound = len(lines) - len(pattern)

    # Exact match
    for index in range(start, upper_bound + 1):
        if lines[index:index + len(pattern)] == pattern:
            return index

    # Ignore trailing whitespace
    for index in range(start, upper_bound + 1):
        if all(
            lines[index + offset].rstrip() == pattern[offset].rstrip()
            for offset in range(len(pattern))
        ):
            return index

    # Ignore leading/trailing whitespace
    for index in range(start, upper_bound + 1):
        if all(
            lines[index + offset].strip() == pattern[offset].strip()
            for offset in range(len(pattern))
        ):
            return index

    # Unicode punctuation/space normalization
    for index in range(start, upper_bound + 1):
        if all(
            _normalize_for_lenient_line_match(lines[index + offset])
            == _normalize_for_lenient_line_match(pattern[offset])
            for offset in range(len(pattern))
        ):
            return index

    return None


def _compute_line_offsets(text: str, lines: list[str]) -> list[int]:
    """
    Compute character offsets for each line start in text.
    """
    offsets: list[int] = []
    cursor = 0
    for line in lines:
        offsets.append(cursor)
        cursor += len(line)
        if cursor < len(text) and text[cursor] == '\n':
            cursor += 1
    return offsets


def _find_line_sequence_spans(content: str, old_string: str) -> list[tuple[int, int]]:
    """
    Find matching line-sequence spans for old_string in content.
    """
    content_lines = _split_lines_for_matching(content)
    pattern_lines = _split_lines_for_matching(old_string)

    if not content_lines or not pattern_lines:
        return []
    if len(pattern_lines) > len(content_lines):
        return []

    offsets = _compute_line_offsets(content, content_lines)
    spans: list[tuple[int, int]] = []
    line_cursor = 0
    include_trailing_newline = old_string.endswith('\n')
    max_start = len(content_lines) - len(pattern_lines)

    while line_cursor <= max_start:
        start_index = _seek_line_sequence(content_lines, pattern_lines, line_cursor)
        if start_index is None:
            break
        end_line = start_index + len(pattern_lines) - 1
        start_char = offsets[start_index]
        end_char = offsets[end_line] + len(content_lines[end_line])
        if include_trailing_newline and end_char < len(content) and content[end_char] == '\n':
            end_char += 1
        spans.append((start_char, end_char))
        line_cursor = start_index + len(pattern_lines)

    return spans


def _apply_spans(content: str, spans: list[tuple[int, int]], new_string: str) -> str:
    """
    Apply replacement spans in reverse order to avoid index shifting.
    """
    updated = content
    for start, end in reversed(spans):
        updated = f"{updated[:start]}{new_string}{updated[end:]}"
    return updated


def _write_file_atomic(path: Path, content: str) -> None:
    """
    Atomically write file content to reduce partial-write risk.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, 'w', encoding=DEFAULT_ENCODING) as handle:
            handle.write(content)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


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
        fallback_spans = _find_line_sequence_spans(normalized_content, normalized_old)
        fallback_count = len(fallback_spans)
        if fallback_count == 0:
            return content, 0

        if not replace_all and fallback_count > 1:
            return content, fallback_count

        spans_to_apply = fallback_spans if replace_all else [fallback_spans[0]]
        return _apply_spans(normalized_content, spans_to_apply, new_string), len(spans_to_apply)

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


async def replace(args: Dict[str, Any]) -> ToolResult:
    """
    Replace text in a file with line ending normalization.
    
    Args:
        args: Dict with file_path, old_string, new_string, replace_all
        
    Returns:
        ToolResult with replacement count
    """
    try:
        file_path = args.get("file_path")
        old_string = args.get("old_string")
        new_string = args.get("new_string")
        replace_all = bool(args.get("replace_all", False))

        if not isinstance(file_path, str) or not file_path:
            return ToolResult.error_result("file_path parameter is required")
        if not isinstance(old_string, str):
            return ToolResult.error_result("old_string parameter is required")
        if not isinstance(new_string, str):
            return ToolResult.error_result("new_string parameter is required")
        
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
        
        if file_exists and old_string == "":
            return ToolResult.error_result(
                "old_string cannot be empty when editing an existing file. "
                "Use old_string='' only when creating a new file."
            )

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
            _write_file_atomic(path, new_content)
        
        await loop.run_in_executor(None, _write_file)
        
        return ToolResult.success_result({
            "replacements": replacements,
            "is_new_file": False,
            "llm_content": f"Successfully modified file: {file_path} ({replacements} replacement(s)).",
        })
    
    except Exception as e:
        logger.error(f"Unexpected error in replace: {e}", exc_info=True)
        return ToolResult.error_result(f"Unexpected error: {str(e)}")
