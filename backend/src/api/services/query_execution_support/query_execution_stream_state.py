"""State container helpers for query stream execution tracking."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class QueryExecutionStreamState:
    saw_terminal_event: bool = False
    saw_text_chunk: bool = False
    text_chunks: list[str] = field(default_factory=list)
    last_assistant_full_text: str = ""

    def observe_texts(
        self,
        *,
        chunk_text: str,
        assistant_full_text: str,
    ) -> None:
        if chunk_text:
            self.saw_text_chunk = True
            self.text_chunks.append(chunk_text)
        if assistant_full_text:
            self.last_assistant_full_text = assistant_full_text

    def mark_terminal(self) -> None:
        self.saw_terminal_event = True

    def completion_kwargs(
        self,
        *,
        event: Any,
        event_type: Optional[str],
    ) -> dict[str, Any]:
        return {
            "event": event,
            "event_type": event_type,
            "text_chunks": self.text_chunks,
            "assistant_full_text": self.last_assistant_full_text,
            "saw_text_chunk": self.saw_text_chunk,
        }
