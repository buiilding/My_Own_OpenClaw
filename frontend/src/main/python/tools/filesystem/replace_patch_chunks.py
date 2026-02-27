"""
Patch-chunk line replacement helpers for filesystem replace engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from tools.filesystem.replace_matchers import _compute_line_offsets, _seek_line_sequence


@dataclass(frozen=True)
class _ChunkReplacement:
    chunk_index: int
    start_idx: int
    old_len: int
    new_lines: list[str]


def _compute_patch_chunk_replacements(
    lines: list[str],
    chunks: list[Any],
) -> tuple[list[_ChunkReplacement] | None, str | None]:
    replacements: list[_ChunkReplacement] = []
    line_index = 0

    for chunk_index, chunk in enumerate(chunks, start=1):
        if chunk.change_context is not None:
            context_index = _seek_line_sequence(
                lines,
                [chunk.change_context],
                line_index,
                'lenient',
            )
            if context_index is None:
                return None, (
                    f"Chunk {chunk_index}: Failed to find context '{chunk.change_context}'"
                )
            line_index = context_index + 1

        if not chunk.old_lines:
            insertion_index = len(lines) - 1 if lines and lines[-1] == '' else len(lines)
            replacements.append(
                _ChunkReplacement(
                    chunk_index=chunk_index,
                    start_idx=insertion_index,
                    old_len=0,
                    new_lines=list(chunk.new_lines),
                )
            )
            continue

        pattern = list(chunk.old_lines)
        new_lines = list(chunk.new_lines)
        found_index = _seek_line_sequence(
            lines,
            pattern,
            line_index,
            'lenient',
            eof=chunk.is_end_of_file,
        )

        if found_index is None and pattern and pattern[-1] == '':
            pattern = pattern[:-1]
            if new_lines and new_lines[-1] == '':
                new_lines = new_lines[:-1]
            found_index = _seek_line_sequence(
                lines,
                pattern,
                line_index,
                'lenient',
                eof=chunk.is_end_of_file,
            )

        if found_index is None:
            expected = '\n'.join(chunk.old_lines)
            return None, (
                f'Chunk {chunk_index}: Failed to find expected lines:\n{expected}'
            )

        replacements.append(
            _ChunkReplacement(
                chunk_index=chunk_index,
                start_idx=found_index,
                old_len=len(pattern),
                new_lines=new_lines,
            )
        )
        line_index = found_index + len(pattern)

    replacements.sort(key=lambda replacement: replacement.start_idx)
    return replacements, None


def _apply_line_replacements(lines: list[str], replacements: list[_ChunkReplacement]) -> list[str]:
    updated = list(lines)
    for replacement in reversed(replacements):
        for _ in range(replacement.old_len):
            if replacement.start_idx < len(updated):
                updated.pop(replacement.start_idx)
        for offset, line in enumerate(replacement.new_lines):
            updated.insert(replacement.start_idx + offset, line)
    return updated


def _line_replacements_to_spans(
    content: str,
    lines: list[str],
    replacements: list[_ChunkReplacement],
) -> list[dict[str, int]]:
    if not replacements:
        return []
    offsets = _compute_line_offsets(content, lines)
    spans: list[dict[str, int]] = []
    for replacement in replacements:
        if replacement.old_len == 0:
            start_char = offsets[replacement.start_idx] if replacement.start_idx < len(offsets) else len(content)
            spans.append({'start': start_char, 'end': start_char})
            continue
        end_line = replacement.start_idx + replacement.old_len - 1
        if replacement.start_idx >= len(offsets) or end_line >= len(lines):
            spans.append({'start': 0, 'end': 0})
            continue
        start_char = offsets[replacement.start_idx]
        end_char = offsets[end_line] + len(lines[end_line])
        if end_char < len(content) and content[end_char] == '\n':
            end_char += 1
        spans.append({'start': start_char, 'end': end_char})
    return spans
