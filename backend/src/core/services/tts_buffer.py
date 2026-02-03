"""Sentence buffering for TTS."""
from __future__ import annotations

import threading
from typing import Iterable, List, Optional, Tuple


class SentenceBuffer:
    """Thread-safe sentence buffer with forced split protection."""

    def __init__(
        self,
        delimiters: Optional[Iterable[str]] = None,
        max_size: int = 500,
        logger=None,
    ) -> None:
        self._buffer_parts: List[str] = []
        self._lock = threading.Lock()
        self._delimiters = set(delimiters or {".", "!", "?", "\n", ";", ":"})
        self._max_size = max_size
        self._logger = logger

    def append(self, text_chunk: str) -> List[str]:
        """Append text and return any complete sentences to synthesize."""
        if not text_chunk:
            return []

        with self._lock:
            self._buffer_parts.append(text_chunk)
            return self._drain_buffer()

    def _drain_buffer(self) -> List[str]:
        buffer = "".join(self._buffer_parts)
        if not buffer:
            return []

        forced_split = self._force_split_buffer(buffer)
        if forced_split:
            forced_sentence, remaining_after_split, split_pos = forced_split
            if forced_sentence and self._logger:
                self._logger.warning(
                    "TTS buffer exceeded %s chars without delimiter. "
                    "Forcing split at position %s to prevent OOM.",
                    self._max_size,
                    split_pos,
                )

            self._buffer_parts.clear()
            sentences = []
            if forced_sentence:
                sentences.append(forced_sentence)
            if remaining_after_split:
                self._buffer_parts.append(remaining_after_split)
                sentences.extend(self._drain_buffer())
            return sentences

        self._buffer_parts.clear()
        sentences, remaining = self._split_sentences(buffer)
        if remaining:
            self._buffer_parts.append(remaining)
        return sentences

    def _force_split_buffer(self, buffer: str) -> Optional[Tuple[str, str, int]]:
        if len(buffer) <= self._max_size:
            return None

        split_pos = self._max_size
        for i in range(self._max_size - 1, max(0, self._max_size - 100), -1):
            if buffer[i].isspace():
                split_pos = i + 1
                break

        forced_sentence = buffer[:split_pos].strip()
        remaining_after_split = buffer[split_pos:].strip()
        return forced_sentence, remaining_after_split, split_pos

    def _split_sentences(self, buffer: str) -> Tuple[List[str], str]:
        sentences: List[str] = []
        start = 0
        i = 0

        while i < len(buffer):
            char = buffer[i]

            if char in self._delimiters:
                if char == "." and self._should_skip_period_split(buffer, i):
                    i += 1
                    continue

                sentence = buffer[start : i + 1]
                clean_sentence = sentence.strip()
                if clean_sentence:
                    sentences.append(clean_sentence)

                start = i + 1

            i += 1

        remaining = buffer[start:]
        return sentences, remaining

    def _should_skip_period_split(self, buffer: str, index: int) -> bool:
        if index + 1 >= len(buffer):
            return True
        next_char = buffer[index + 1]
        return next_char.isalnum() or next_char in {"`", "'", '"', "-", "_"}

    def flush(self) -> Optional[str]:
        """Return remaining buffered text and clear internal buffer."""
        with self._lock:
            text = "".join(self._buffer_parts).strip()
            self._buffer_parts.clear()
            return text or None
