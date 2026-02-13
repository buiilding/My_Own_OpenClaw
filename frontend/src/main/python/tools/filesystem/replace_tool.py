"""
Replace Tool - Python implementation.

Thin I/O wrapper around replace_engine.
"""

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict

from tools.filesystem.replace_engine import ReplaceOperation
from tools.filesystem.replace_engine import apply_operations
from tools.filesystem.replace_engine import build_operations
from tools.filesystem.replace_engine import build_unified_diff
from tools.filesystem.replace_engine import normalize_line_endings
from tools.result import ToolResult

logger = logging.getLogger(__name__)

# Default encoding
DEFAULT_ENCODING = 'utf-8'


def _write_file_atomic(path: Path, content: str) -> None:
    """
    Atomically write file content to reduce partial-write risk.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix=f'.{path.name}.', suffix='.tmp', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'w', encoding=DEFAULT_ENCODING) as handle:
            handle.write(content)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def _can_create_new_file_from_operation(operation: ReplaceOperation) -> bool:
    """
    Creation mode is limited to a single unconstrained operation with old_string=''.
    """
    return (
        operation.old_string == ''
        and operation.before_context is None
        and operation.after_context is None
        and operation.occurrence_index is None
        and not operation.require_eof
    )


async def replace(args: Dict[str, Any]) -> ToolResult:
    """
    Replace text in a file with strict/lenient context-aware matching.
    """
    try:
        file_path = args.get('file_path')
        if not isinstance(file_path, str) or not file_path:
            return ToolResult.error_result('file_path parameter is required')

        operations, operations_error = build_operations(args)
        if operations_error is not None:
            return ToolResult.error_result(operations_error)
        if operations is None:
            return ToolResult.error_result('No replacement operations provided')

        path = Path(file_path)
        if not path.is_absolute():
            return ToolResult.error_result(f'File path must be absolute: {file_path}')

        file_exists = path.exists()
        if not file_exists:
            if len(operations) == 1 and _can_create_new_file_from_operation(operations[0]):
                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with open(path, 'w', encoding=DEFAULT_ENCODING) as handle:
                        handle.write(operations[0].new_string)
                    return ToolResult.success_result(
                        {
                            'replacements': 1,
                            'is_new_file': True,
                            'llm_content': f'Created new file: {file_path} with provided content.',
                            'matched_spans': [],
                            'operations': [],
                            'unified_diff': build_unified_diff('', operations[0].new_string, file_path),
                        }
                    )
                except OSError as exc:
                    return ToolResult.error_result(f'Failed to create file: {exc}')

            return ToolResult.error_result(
                'File does not exist. To create a file, provide exactly one replacement '
                "with old_string='' and no context constraints."
            )

        def _read_file() -> str:
            try:
                return path.read_text(encoding=DEFAULT_ENCODING)
            except UnicodeDecodeError:
                return path.read_text(encoding=DEFAULT_ENCODING, errors='replace')

        loop = asyncio.get_event_loop()
        current_content = await loop.run_in_executor(None, _read_file)
        normalized_content = normalize_line_endings(current_content)

        new_content, total_replacements, all_spans, operation_payloads, apply_error = apply_operations(
            normalized_content,
            operations,
        )
        if apply_error is not None:
            return ToolResult.error_result(apply_error)

        unified_diff = build_unified_diff(normalized_content, new_content, file_path)

        def _write_file() -> None:
            _write_file_atomic(path, new_content)

        await loop.run_in_executor(None, _write_file)

        return ToolResult.success_result(
            {
                'replacements': total_replacements,
                'is_new_file': False,
                'matched_spans': all_spans,
                'operations': operation_payloads,
                'unified_diff': unified_diff,
                'llm_content': (
                    f'Successfully modified file: {file_path} '
                    f'({total_replacements} replacement(s)).'
                ),
            }
        )
    except Exception as exc:
        logger.error(f'Unexpected error in replace: {exc}', exc_info=True)
        return ToolResult.error_result(f'Unexpected error: {str(exc)}')
