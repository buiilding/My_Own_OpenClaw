"""
Shared line/content matching helpers for filesystem replace engine.
"""

from __future__ import annotations


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
    eof: bool = False,
) -> int | None:
    if not pattern:
        return start
    if len(pattern) > len(lines):
        return None

    search_start = len(lines) - len(pattern) if eof and len(lines) >= len(pattern) else start
    if search_start < 0:
        search_start = 0
    upper_bound = len(lines) - len(pattern)

    for index in range(search_start, upper_bound + 1):
        if lines[index:index + len(pattern)] == pattern:
            return index

    if mode == 'strict':
        return None

    for index in range(search_start, upper_bound + 1):
        if all(
            lines[index + offset].rstrip() == pattern[offset].rstrip()
            for offset in range(len(pattern))
        ):
            return index

    for index in range(search_start, upper_bound + 1):
        if all(
            lines[index + offset].strip() == pattern[offset].strip()
            for offset in range(len(pattern))
        ):
            return index

    for index in range(search_start, upper_bound + 1):
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


def _filter_spans_with_context(
    content: str,
    spans: list[tuple[int, int]],
    before_context: str | None,
    after_context: str | None,
    require_eof: bool,
    match_mode: str,
) -> list[tuple[int, int]]:
    def _line_match(lhs: str, rhs: str) -> bool:
        if lhs == rhs:
            return True
        if match_mode == 'strict':
            return False
        if lhs.rstrip() == rhs.rstrip():
            return True
        if lhs.strip() == rhs.strip():
            return True
        return _normalize_for_lenient_line_match(lhs) == _normalize_for_lenient_line_match(rhs)

    def _matches_anchored_line_context(segment: str, pattern_text: str, anchor_end: bool) -> bool:
        pattern_lines = _split_lines_for_matching(pattern_text)
        if not pattern_lines:
            return True

        segment_lines = _split_lines_for_matching(segment)
        if len(pattern_lines) > len(segment_lines):
            return False

        if anchor_end:
            segment_slice = segment_lines[-len(pattern_lines):]
        else:
            segment_slice = segment_lines[:len(pattern_lines)]

        return all(_line_match(segment_slice[idx], pattern_lines[idx]) for idx in range(len(pattern_lines)))

    def _context_matches_before(start: int) -> bool:
        if before_context is None:
            return True
        before_len = len(before_context)
        if start >= before_len and content[start - before_len:start] == before_context:
            return True
        if match_mode == 'strict':
            return False
        if (
            start >= before_len
            and _normalize_for_lenient_line_match(content[start - before_len:start])
            == _normalize_for_lenient_line_match(before_context)
        ):
            return True
        return _matches_anchored_line_context(content[:start], before_context, anchor_end=True)

    def _context_matches_after(end: int) -> bool:
        if after_context is None:
            return True
        after_len = len(after_context)
        if content[end:end + after_len] == after_context:
            return True
        if match_mode == 'strict':
            return False
        if _normalize_for_lenient_line_match(content[end:end + after_len]) == _normalize_for_lenient_line_match(
            after_context
        ):
            return True
        return _matches_anchored_line_context(content[end:], after_context, anchor_end=False)

    filtered: list[tuple[int, int]] = []
    for start, end in spans:
        if not _context_matches_before(start):
            continue
        if not _context_matches_after(end):
            continue

        if require_eof and content[end:].strip('\n') != '':
            continue

        filtered.append((start, end))

    return filtered
