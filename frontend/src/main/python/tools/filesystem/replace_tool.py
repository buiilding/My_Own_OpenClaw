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

from core.executors import get_interactive_executor
from tools.filesystem.replace_engine import (
    ReplaceOperation,
    apply_operations,
    apply_patch_chunks,
    build_operations,
    build_patch_chunks,
    build_unified_diff,
    normalize_line_endings,
)
from tools.path_resolution import resolve_workspace_path
from tools.result import ToolResult

logger = logging.getLogger(__name__)

# Default encoding
DEFAULT_ENCODING = "utf-8"
MAX_REPLACE_NEW_STRING_BYTES = 16 * 1024


def _resolve_replace_file_path(
    raw_file_path: object,
) -> tuple[Path | None, str | None, str | None]:
    resolved_path, normalized_input, path_error = resolve_workspace_path(raw_file_path)
    if path_error:
        return None, None, "file_path parameter is required"
    if resolved_path is None:
        return None, None, "file_path parameter is required"
    if not normalized_input:
        return None, None, "file_path parameter is required"
    return resolved_path, normalized_input, None


def _write_file_atomic(path: Path, content: str) -> None:
    """
    Atomically write file content to reduce partial-write risk.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding=DEFAULT_ENCODING) as handle:
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
        operation.old_string == ""
        and operation.before_context is None
        and operation.after_context is None
        and operation.occurrence_index is None
        and not operation.require_eof
    )


def _validate_operation_payload_sizes(operations: list[ReplaceOperation]) -> str | None:
    """
    Keep single replace calls reasonably small to reduce malformed streamed tool args.
    """
    for operation in operations:
        payload_size = len(operation.new_string.encode(DEFAULT_ENCODING))
        if payload_size > MAX_REPLACE_NEW_STRING_BYTES:
            return (
                "Payload too large for one replace call; split into multiple "
                "replace/apply_patch calls."
            )
    return None


async def replace(args: Dict[str, Any]) -> ToolResult:
    """
    Replace text in a file with strict/lenient context-aware matching.
    """
    try:
        path, normalized_input, path_error = _resolve_replace_file_path(
            args.get("file_path")
        )
        if path_error is not None or path is None or normalized_input is None:
            return ToolResult.error_result("file_path parameter is required")

        patch_chunks, patch_chunks_error = build_patch_chunks(args)
        if patch_chunks_error is not None:
            return ToolResult.error_result(patch_chunks_error)

        using_patch_chunks = patch_chunks is not None
        if using_patch_chunks and args.get("replacements") is not None:
            return ToolResult.error_result(
                "patch_chunks cannot be combined with replacements"
            )

        operations: list[ReplaceOperation] | None = None
        if not using_patch_chunks:
            operations, operations_error = build_operations(args)
            if operations_error is not None:
                return ToolResult.error_result(operations_error)
            if operations is None:
                return ToolResult.error_result("No replacement operations provided")
            payload_error = _validate_operation_payload_sizes(operations)
            if payload_error is not None:
                return ToolResult.error_result(payload_error)

        file_exists = path.exists()
        if not file_exists:
            if using_patch_chunks:
                return ToolResult.error_result(
                    f"File does not exist: {normalized_input} "
                    f"(resolved to {path}). patch_chunks updates require an existing file."
                )

            if len(operations) == 1 and _can_create_new_file_from_operation(
                operations[0]
            ):
                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with open(path, "w", encoding=DEFAULT_ENCODING) as handle:
                        handle.write(operations[0].new_string)
                    return ToolResult.success_result(
                        {
                            "replacements": 1,
                            "is_new_file": True,
                            "output": f"Created new file: {path} with provided content.",
                            "matched_spans": [],
                            "operations": [],
                            "unified_diff": build_unified_diff(
                                "", operations[0].new_string, str(path)
                            ),
                        }
                    )
                except OSError as exc:
                    return ToolResult.error_result(f"Failed to create file: {exc}")

            return ToolResult.error_result(
                f"File does not exist: {normalized_input} (resolved to {path}). "
                "To create a file, provide exactly one replacement with old_string='' "
                "and no context constraints."
            )

        def _read_file() -> str:
            try:
                return path.read_text(encoding=DEFAULT_ENCODING)
            except UnicodeDecodeError:
                return path.read_text(encoding=DEFAULT_ENCODING, errors="replace")

        loop = asyncio.get_event_loop()
        current_content = await loop.run_in_executor(
            get_interactive_executor(), _read_file
        )
        normalized_content = normalize_line_endings(current_content)

        if using_patch_chunks:
            (
                new_content,
                total_replacements,
                all_spans,
                operation_payloads,
                apply_error,
            ) = apply_patch_chunks(
                normalized_content,
                patch_chunks,
            )
        else:
            (
                new_content,
                total_replacements,
                all_spans,
                operation_payloads,
                apply_error,
            ) = apply_operations(
                normalized_content,
                operations,
            )
        if apply_error is not None:
            return ToolResult.error_result(apply_error)

        unified_diff = build_unified_diff(normalized_content, new_content, str(path))

        def _write_file() -> None:
            _write_file_atomic(path, new_content)

        await loop.run_in_executor(get_interactive_executor(), _write_file)

        return ToolResult.success_result(
            {
                "replacements": total_replacements,
                "is_new_file": False,
                "matched_spans": all_spans,
                "operations": operation_payloads,
                "unified_diff": unified_diff,
                "output": (
                    f"Successfully modified file: {path} "
                    f"({total_replacements} replacement(s))."
                ),
            }
        )
    except Exception as exc:
        logger.error(f"Unexpected error in replace: {exc}", exc_info=True)
        return ToolResult.error_result(f"Unexpected error: {str(exc)}")
