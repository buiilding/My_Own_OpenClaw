"""
Core matching/parsing engine for filesystem replace tool.
"""

from __future__ import annotations

import difflib
from dataclasses import dataclass
from typing import Any

VALID_MATCH_MODES = {'strict', 'lenient'}


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


def normalize_line_endings(text: str) -> str:
    """
    Normalize line endings to Unix newlines.
    """
    return text.replace('\r\n', '\n').replace('\r', '\n')


def build_unified_diff(before: str, after: str, file_path: str) -> str:
    """
    Generate a unified diff between pre/post file contents.
    """
    if before == after:
        return ''

    before_lines = before.splitlines(keepends=True)
    after_lines = after.splitlines(keepends=True)
    diff_lines = difflib.unified_diff(
        before_lines,
        after_lines,
        fromfile=file_path,
        tofile=file_path,
        lineterm='',
    )
    return ''.join(diff_lines)


def _normalize_for_lenient_line_match(text: str) -> str:
    normalized = text.strip()
    translations = {
        '\u2010': '-',
        '\u2011': '-',
        '\u2012': '-',
        '\u2013': '-',
        '\u2014': '-',
        '\u2015': '-',
        '\u2212': '-',
        '\u2018': "'",
        '\u2019': "'",
        '\u201A': "'",
        '\u201B': "'",
        '\u201C': '"',
        '\u201D': '"',
        '\u201E': '"',
        '\u201F': '"',
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


def _filter_spans_with_context(
    content: str,
    spans: list[tuple[int, int]],
    before_context: str | None,
    after_context: str | None,
    require_eof: bool,
) -> list[tuple[int, int]]:
    filtered: list[tuple[int, int]] = []
    for start, end in spans:
        if before_context is not None:
            before_len = len(before_context)
            if start < before_len:
                continue
            if content[start - before_len:start] != before_context:
                continue

        if after_context is not None:
            after_len = len(after_context)
            if content[end:end + after_len] != after_context:
                continue

        if require_eof and content[end:].strip('\n') != '':
            continue

        filtered.append((start, end))

    return filtered


def _split_lines_for_matching(text: str) -> list[str]:
    lines = text.split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    return lines


def _seek_line_sequence(
    lines: list[str],
    pattern: list[str],
    start: int,
    mode: str,
) -> int | None:
    if not pattern:
        return start
    if len(pattern) > len(lines):
        return None

    upper_bound = len(lines) - len(pattern)

    for index in range(start, upper_bound + 1):
        if lines[index:index + len(pattern)] == pattern:
            return index

    if mode == 'strict':
        return None

    for index in range(start, upper_bound + 1):
        if all(
            lines[index + offset].rstrip() == pattern[offset].rstrip()
            for offset in range(len(pattern))
        ):
            return index

    for index in range(start, upper_bound + 1):
        if all(
            lines[index + offset].strip() == pattern[offset].strip()
            for offset in range(len(pattern))
        ):
            return index

    for index in range(start, upper_bound + 1):
        if all(
            _normalize_for_lenient_line_match(lines[index + offset])
            == _normalize_for_lenient_line_match(pattern[offset])
            for offset in range(len(pattern))
        ):
            return index

    return None


def _compute_line_offsets(text: str, lines: list[str]) -> list[int]:
    offsets: list[int] = []
    cursor = 0
    for line in lines:
        offsets.append(cursor)
        cursor += len(line)
        if cursor < len(text) and text[cursor] == '\n':
            cursor += 1
    return offsets


def _find_exact_spans(content: str, target: str) -> list[tuple[int, int]]:
    if not target:
        return []

    spans: list[tuple[int, int]] = []
    cursor = 0
    while True:
        index = content.find(target, cursor)
        if index == -1:
            break
        end = index + len(target)
        spans.append((index, end))
        cursor = end
    return spans


def _find_line_sequence_spans(
    content: str,
    old_string: str,
    mode: str,
) -> list[tuple[int, int]]:
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
        start_index = _seek_line_sequence(content_lines, pattern_lines, line_cursor, mode)
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


def _apply_spans(
    content: str,
    spans: list[tuple[int, int]],
    new_string: str,
) -> str:
    updated = content
    for start, end in reversed(spans):
        updated = f'{updated[:start]}{new_string}{updated[end:]}'
    return updated


def _normalize_optional_text(value: Any, field_name: str) -> tuple[str | None, str | None]:
    if value is None:
        return None, None
    if not isinstance(value, str):
        return None, f'{field_name} must be a string when provided'
    return normalize_line_endings(value), None


def _normalize_occurrence_index(value: Any) -> tuple[int | None, str | None]:
    if value is None:
        return None, None
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        return None, 'occurrence_index must be an integer >= 1 when provided'
    return value, None


def _normalize_match_mode(value: Any, field_name: str) -> tuple[str, str | None]:
    if value is None:
        return 'lenient', None
    if not isinstance(value, str):
        return 'lenient', f'{field_name} must be one of: strict, lenient'
    mode = value.strip().lower()
    if mode not in VALID_MATCH_MODES:
        return 'lenient', f'{field_name} must be one of: strict, lenient'
    return mode, None


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    return bool(value)


def _build_operation(
    payload: dict[str, Any],
    default_mode: str,
) -> tuple[ReplaceOperation | None, str | None]:
    old_string = payload.get('old_string')
    new_string = payload.get('new_string')
    if not isinstance(old_string, str):
        return None, 'old_string parameter is required'
    if not isinstance(new_string, str):
        return None, 'new_string parameter is required'

    before_context, before_error = _normalize_optional_text(
        payload.get('before_context'),
        'before_context',
    )
    if before_error is not None:
        return None, before_error

    after_context, after_error = _normalize_optional_text(
        payload.get('after_context'),
        'after_context',
    )
    if after_error is not None:
        return None, after_error

    occurrence_index, occurrence_error = _normalize_occurrence_index(
        payload.get('occurrence_index')
    )
    if occurrence_error is not None:
        return None, occurrence_error

    match_mode, mode_error = _normalize_match_mode(payload.get('match_mode'), 'match_mode')
    if mode_error is not None:
        return None, mode_error
    if 'match_mode' not in payload:
        match_mode = default_mode

    replace_all = _coerce_bool(payload.get('replace_all'), default=False)
    require_eof = _coerce_bool(payload.get('require_eof'), default=False)

    if replace_all and occurrence_index is not None:
        return None, 'occurrence_index cannot be combined with replace_all=true'

    return ReplaceOperation(
        old_string=normalize_line_endings(old_string),
        new_string=normalize_line_endings(new_string),
        replace_all=replace_all,
        before_context=before_context,
        after_context=after_context,
        occurrence_index=occurrence_index,
        require_eof=require_eof,
        match_mode=match_mode,
    ), None


def build_operations(args: dict[str, Any]) -> tuple[list[ReplaceOperation] | None, str | None]:
    """
    Parse top-level payload into one or more operations.
    """
    default_mode, mode_error = _normalize_match_mode(args.get('match_mode'), 'match_mode')
    if mode_error is not None:
        return None, mode_error

    raw_operations = args.get('replacements')
    if raw_operations is not None:
        if not isinstance(raw_operations, list) or not raw_operations:
            return None, 'replacements must be a non-empty list when provided'
        operations: list[ReplaceOperation] = []
        for index, item in enumerate(raw_operations, start=1):
            if not isinstance(item, dict):
                return None, f'replacements[{index}] must be an object'
            operation, operation_error = _build_operation(item, default_mode)
            if operation_error is not None:
                return None, f'replacements[{index}]: {operation_error}'
            if operation is None:
                return None, f'replacements[{index}]: invalid replacement operation'
            operations.append(operation)
        return operations, None

    operation, operation_error = _build_operation(args, default_mode)
    if operation_error is not None:
        return None, operation_error
    if operation is None:
        return None, 'invalid replacement operation'
    return [operation], None


def _perform_replacement_operation(
    content: str,
    operation: ReplaceOperation,
) -> tuple[str, list[tuple[int, int]], str | None]:
    if operation.old_string == '':
        return content, [], (
            "old_string cannot be empty when editing an existing file. "
            "Use old_string='' only when creating a new file."
        )

    exact_spans = _find_exact_spans(content, operation.old_string)
    candidate_spans = _filter_spans_with_context(
        content,
        exact_spans,
        operation.before_context,
        operation.after_context,
        operation.require_eof,
    )

    if not candidate_spans and operation.match_mode == 'lenient':
        fallback_spans = _find_line_sequence_spans(content, operation.old_string, operation.match_mode)
        candidate_spans = _filter_spans_with_context(
            content,
            fallback_spans,
            operation.before_context,
            operation.after_context,
            operation.require_eof,
        )

    if not candidate_spans:
        return content, [], (
            'Failed to edit, could not find the string to replace with the provided constraints. '
            'Please verify old_string and any context fields.'
        )

    selected_spans: list[tuple[int, int]]
    if operation.occurrence_index is not None:
        if operation.occurrence_index > len(candidate_spans):
            return content, [], (
                f'occurrence_index={operation.occurrence_index} is out of range for '
                f'{len(candidate_spans)} match(es).'
            )
        selected_spans = [candidate_spans[operation.occurrence_index - 1]]
    elif operation.replace_all:
        selected_spans = candidate_spans
    else:
        if len(candidate_spans) > 1:
            return content, [], (
                'Multiple matches found. Provide more unique context around the specific text '
                'you want to replace, set occurrence_index, or use replace_all=true.'
            )
        selected_spans = [candidate_spans[0]]

    updated = _apply_spans(content, selected_spans, operation.new_string)
    return updated, selected_spans, None


def _span_payload(spans: list[tuple[int, int]]) -> list[dict[str, int]]:
    return [{'start': start, 'end': end} for start, end in spans]


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
            return content, 0, [], [], f'Operation {index}: {operation_error}'

        operation_spans = _span_payload(spans)
        total_replacements += len(spans)
        all_spans.extend(operation_spans)
        operation_payloads.append(
            {
                'index': index,
                'applied_replacements': len(spans),
                'match_mode': operation.match_mode,
                'matched_spans': operation_spans,
            }
        )
        working_content = updated_content

    if total_replacements == 0:
        return content, 0, [], [], (
            'Failed to edit, could not find the string to replace. '
            'Please verify the exact text exists in the file.'
        )

    return working_content, total_replacements, all_spans, operation_payloads, None
