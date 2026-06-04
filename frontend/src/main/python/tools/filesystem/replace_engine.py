"""
Core matching/parsing engine for filesystem replace tool.
"""

from __future__ import annotations

import difflib
from dataclasses import dataclass
from typing import Any

from tools.filesystem.replace_matchers import (
    _filter_spans_with_context,
    _find_exact_spans,
    _find_line_sequence_spans,
    _split_lines_for_matching,
)
from tools.filesystem.replace_patch_chunks import (
    _apply_line_replacements,
    _compute_patch_chunk_replacements,
    _line_replacements_to_spans,
)

VALID_MATCH_MODES = {"strict", "lenient"}


@dataclass(frozen=True)
class ReplaceOperation:
    old_string: str
    new_string: str
    replace_all: bool
    before_context: str | None
    after_context: str | None
    occurrence_index: int | None
    require_eof: bool
    match_mode: str


@dataclass(frozen=True)
class ReplacePatchChunk:
    change_context: str | None
    old_lines: list[str]
    new_lines: list[str]
    is_end_of_file: bool


def normalize_line_endings(text: str) -> str:
    """
    Normalize line endings to Unix newlines.
    """
    return text.replace("\r\n", "\n").replace("\r", "\n")


def build_unified_diff(before: str, after: str, file_path: str) -> str:
    """
    Generate a unified diff between pre/post file contents.
    """
    if before == after:
        return ""

    before_lines = before.splitlines(keepends=True)
    after_lines = after.splitlines(keepends=True)
    diff_lines = difflib.unified_diff(
        before_lines,
        after_lines,
        fromfile=file_path,
        tofile=file_path,
        lineterm="",
    )
    return "".join(diff_lines)


def _apply_spans(
    content: str,
    spans: list[tuple[int, int]],
    new_string: str,
) -> str:
    updated = content
    for start, end in reversed(spans):
        updated = f"{updated[:start]}{new_string}{updated[end:]}"
    return updated


def _normalize_optional_text(
    value: Any, field_name: str
) -> tuple[str | None, str | None]:
    if value is None:
        return None, None
    if not isinstance(value, str):
        return None, f"{field_name} must be a string when provided"
    return normalize_line_endings(value), None


def _normalize_occurrence_index(value: Any) -> tuple[int | None, str | None]:
    if value is None:
        return None, None
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        return None, "occurrence_index must be an integer >= 1 when provided"
    return value, None


def _normalize_match_mode(value: Any, field_name: str) -> tuple[str, str | None]:
    if value is None:
        return "lenient", None
    if not isinstance(value, str):
        return "lenient", f"{field_name} must be one of: strict, lenient"
    mode = value.strip().lower()
    if mode not in VALID_MATCH_MODES:
        return "lenient", f"{field_name} must be one of: strict, lenient"
    return mode, None


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    return bool(value)


def _build_operation(
    payload: dict[str, Any],
    default_mode: str,
) -> tuple[ReplaceOperation | None, str | None]:
    old_string = payload.get("old_string")
    new_string = payload.get("new_string")
    if not isinstance(old_string, str):
        return None, "old_string parameter is required"
    if not isinstance(new_string, str):
        return None, "new_string parameter is required"

    before_context, before_error = _normalize_optional_text(
        payload.get("before_context"),
        "before_context",
    )
    if before_error is not None:
        return None, before_error

    after_context, after_error = _normalize_optional_text(
        payload.get("after_context"),
        "after_context",
    )
    if after_error is not None:
        return None, after_error

    occurrence_index, occurrence_error = _normalize_occurrence_index(
        payload.get("occurrence_index")
    )
    if occurrence_error is not None:
        return None, occurrence_error

    match_mode, mode_error = _normalize_match_mode(
        payload.get("match_mode"), "match_mode"
    )
    if mode_error is not None:
        return None, mode_error
    if "match_mode" not in payload:
        match_mode = default_mode

    replace_all = _coerce_bool(payload.get("replace_all"), default=False)
    require_eof = _coerce_bool(payload.get("require_eof"), default=False)

    if replace_all and occurrence_index is not None:
        return None, "occurrence_index cannot be combined with replace_all=true"

    return (
        ReplaceOperation(
            old_string=normalize_line_endings(old_string),
            new_string=normalize_line_endings(new_string),
            replace_all=replace_all,
            before_context=before_context,
            after_context=after_context,
            occurrence_index=occurrence_index,
            require_eof=require_eof,
            match_mode=match_mode,
        ),
        None,
    )


def _normalize_line_array(
    value: Any,
    field_name: str,
    chunk_index: int,
) -> tuple[list[str] | None, str | None]:
    if not isinstance(value, list):
        return (
            None,
            f"patch_chunks[{chunk_index}].{field_name} must be a list of strings",
        )

    normalized: list[str] = []
    for line_index, line in enumerate(value, start=1):
        if not isinstance(line, str):
            return None, (
                f"patch_chunks[{chunk_index}].{field_name}[{line_index}] "
                "must be a string"
            )
        normalized_line = normalize_line_endings(line)
        if "\n" in normalized_line:
            return None, (
                f"patch_chunks[{chunk_index}].{field_name}[{line_index}] "
                "must contain exactly one line (no newline characters)"
            )
        normalized.append(normalized_line)

    return normalized, None


def build_patch_chunks(
    args: dict[str, Any]
) -> tuple[list[ReplacePatchChunk] | None, str | None]:
    raw_chunks = args.get("patch_chunks")
    if raw_chunks is None:
        return None, None

    if not isinstance(raw_chunks, list) or not raw_chunks:
        return None, "patch_chunks must be a non-empty list when provided"

    chunks: list[ReplacePatchChunk] = []
    for chunk_index, raw_chunk in enumerate(raw_chunks, start=1):
        if not isinstance(raw_chunk, dict):
            return None, f"patch_chunks[{chunk_index}] must be an object"

        change_context_value = raw_chunk.get("change_context")
        if change_context_value is not None and not isinstance(
            change_context_value, str
        ):
            return (
                None,
                f"patch_chunks[{chunk_index}].change_context must be a string when provided",
            )
        change_context = (
            normalize_line_endings(change_context_value)
            if isinstance(change_context_value, str)
            else None
        )
        if change_context is not None and "\n" in change_context:
            return None, (
                f"patch_chunks[{chunk_index}].change_context "
                "must contain exactly one line (no newline characters)"
            )

        old_lines, old_lines_error = _normalize_line_array(
            raw_chunk.get("old_lines"), "old_lines", chunk_index
        )
        if old_lines_error is not None:
            return None, old_lines_error
        if old_lines is None:
            return None, f"patch_chunks[{chunk_index}].old_lines is required"

        new_lines, new_lines_error = _normalize_line_array(
            raw_chunk.get("new_lines"), "new_lines", chunk_index
        )
        if new_lines_error is not None:
            return None, new_lines_error
        if new_lines is None:
            return None, f"patch_chunks[{chunk_index}].new_lines is required"

        chunks.append(
            ReplacePatchChunk(
                change_context=change_context,
                old_lines=old_lines,
                new_lines=new_lines,
                is_end_of_file=_coerce_bool(
                    raw_chunk.get("is_end_of_file"), default=False
                ),
            )
        )

    return chunks, None


def build_operations(
    args: dict[str, Any]
) -> tuple[list[ReplaceOperation] | None, str | None]:
    """
    Parse replacement payload into one or more operations.
    """
    default_mode, mode_error = _normalize_match_mode(
        args.get("match_mode"), "match_mode"
    )
    if mode_error is not None:
        return None, mode_error

    raw_operations = args.get("replacements")
    if not isinstance(raw_operations, list) or not raw_operations:
        return None, "replacements must be a non-empty list when provided"

    operations: list[ReplaceOperation] = []
    for index, item in enumerate(raw_operations, start=1):
        if not isinstance(item, dict):
            return None, f"replacements[{index}] must be an object"
        operation, operation_error = _build_operation(item, default_mode)
        if operation_error is not None:
            return None, f"replacements[{index}]: {operation_error}"
        if operation is None:
            return None, f"replacements[{index}]: invalid replacement operation"
        operations.append(operation)
    return operations, None


def apply_patch_chunks(
    content: str,
    chunks: list[ReplacePatchChunk],
) -> tuple[str, int, list[dict[str, int]], list[dict[str, Any]], str | None]:
    source_lines = _split_lines_for_matching(content)
    replacements, replacements_error = _compute_patch_chunk_replacements(
        source_lines, chunks
    )
    if replacements_error is not None:
        return content, 0, [], [], replacements_error
    if replacements is None:
        return content, 0, [], [], "Failed to apply patch chunks"

    matched_spans = _line_replacements_to_spans(content, source_lines, replacements)
    operation_payloads: list[dict[str, Any]] = []
    for replacement, span in zip(replacements, matched_spans):
        operation_payloads.append(
            {
                "index": replacement.chunk_index,
                "mode": "patch_chunk",
                "applied_replacements": 1,
                "matched_spans": [span],
            }
        )

    updated_lines = _apply_line_replacements(source_lines, replacements)
    if not updated_lines or updated_lines[-1] != "":
        updated_lines.append("")
    updated_content = "\n".join(updated_lines)

    return updated_content, len(replacements), matched_spans, operation_payloads, None


def _perform_replacement_operation(
    content: str,
    operation: ReplaceOperation,
) -> tuple[str, list[tuple[int, int]], str | None]:
    if operation.old_string == "":
        return (
            content,
            [],
            (
                "old_string cannot be empty when editing an existing file. "
                "Use old_string='' only when creating a new file."
            ),
        )

    exact_spans = _find_exact_spans(content, operation.old_string)
    candidate_spans = _filter_spans_with_context(
        content,
        exact_spans,
        operation.before_context,
        operation.after_context,
        operation.require_eof,
        operation.match_mode,
    )

    if not candidate_spans and operation.match_mode == "lenient":
        fallback_spans = _find_line_sequence_spans(
            content, operation.old_string, operation.match_mode
        )
        candidate_spans = _filter_spans_with_context(
            content,
            fallback_spans,
            operation.before_context,
            operation.after_context,
            operation.require_eof,
            operation.match_mode,
        )

    if not candidate_spans:
        return (
            content,
            [],
            (
                "Failed to edit, could not find the string to replace with the provided constraints. "
                "Please verify old_string and any context fields."
            ),
        )

    selected_spans: list[tuple[int, int]]
    if operation.occurrence_index is not None:
        if operation.occurrence_index > len(candidate_spans):
            return (
                content,
                [],
                (
                    f"occurrence_index={operation.occurrence_index} is out of range for "
                    f"{len(candidate_spans)} match(es)."
                ),
            )
        selected_spans = [candidate_spans[operation.occurrence_index - 1]]
    elif operation.replace_all:
        selected_spans = candidate_spans
    else:
        if len(candidate_spans) > 1:
            return (
                content,
                [],
                (
                    "Multiple matches found. Provide more unique context around the specific text "
                    "you want to replace, set occurrence_index, or use replace_all=true."
                ),
            )
        selected_spans = [candidate_spans[0]]

    updated = _apply_spans(content, selected_spans, operation.new_string)
    return updated, selected_spans, None


def _span_payload(spans: list[tuple[int, int]]) -> list[dict[str, int]]:
    return [{"start": start, "end": end} for start, end in spans]


def apply_operations(
    content: str,
    operations: list[ReplaceOperation],
) -> tuple[str, int, list[dict[str, int]], list[dict[str, Any]], str | None]:
    """
    Apply operations in-memory; returns new content and structured metadata.
    """
    working_content = content
    total_replacements = 0
    all_spans: list[dict[str, int]] = []
    operation_payloads: list[dict[str, Any]] = []

    for index, operation in enumerate(operations, start=1):
        updated_content, spans, operation_error = _perform_replacement_operation(
            working_content,
            operation,
        )
        if operation_error is not None:
            return content, 0, [], [], f"Operation {index}: {operation_error}"

        operation_spans = _span_payload(spans)
        total_replacements += len(spans)
        all_spans.extend(operation_spans)
        operation_payloads.append(
            {
                "index": index,
                "applied_replacements": len(spans),
                "match_mode": operation.match_mode,
                "matched_spans": operation_spans,
            }
        )
        working_content = updated_content

    if total_replacements == 0:
        return (
            content,
            0,
            [],
            [],
            (
                "Failed to edit, could not find the string to replace. "
                "Please verify the exact text exists in the file."
            ),
        )

    return working_content, total_replacements, all_spans, operation_payloads, None
