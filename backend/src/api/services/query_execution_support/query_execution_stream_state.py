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
    event_count: int = 0
    chunk_count: int = 0
    tool_call_count: int = 0
    tool_output_count: int = 0
    terminal_event_type: Optional[str] = None
    fallback_completion_used: bool = False

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

    def observe_event_type(self, event_type: Optional[str]) -> None:
        if not event_type:
            return
        self.event_count += 1
        if event_type == "streaming-response":
            self.chunk_count += 1
        elif event_type == "tool-call":
            self.tool_call_count += 1
        elif event_type == "tool-output":
            self.tool_output_count += 1
        if event_type in {"streaming-complete", "error"}:
            self.terminal_event_type = event_type

    def mark_fallback_completion_used(self) -> None:
        self.fallback_completion_used = True

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
