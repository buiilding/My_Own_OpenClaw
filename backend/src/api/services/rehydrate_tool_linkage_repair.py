"""Pending tool-call linkage repair helpers for rehydrate replay."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass(slots=True)
class RehydrateToolLinkageState:
    """Track known and pending tool-call ids while rebuilding transcript history."""

    known_tool_call_ids: set[str] = field(default_factory=set)
    pending_tool_call_ids: List[str] = field(default_factory=list)

    def register_tool_call_ids(self, tool_call_ids: List[str]) -> None:
        for tool_call_id in tool_call_ids:
            if not isinstance(tool_call_id, str) or not tool_call_id:
                continue
            self.known_tool_call_ids.add(tool_call_id)
            if tool_call_id not in self.pending_tool_call_ids:
                self.pending_tool_call_ids.append(tool_call_id)

    def consume_tool_output_tool_call_id(
        self,
        explicit_tool_call_id: Optional[str] = None,
    ) -> Optional[str]:
        if (
            explicit_tool_call_id
            and explicit_tool_call_id in self.pending_tool_call_ids
        ):
            self.pending_tool_call_ids.remove(explicit_tool_call_id)
            return explicit_tool_call_id
        if explicit_tool_call_id:
            return explicit_tool_call_id
        if not self.pending_tool_call_ids:
            return None
        return self.pending_tool_call_ids.pop(0)

    def build_missing_tool_output_entries(
        self,
        *,
        timestamp: Optional[str],
    ) -> List[Dict[str, object]]:
        if not self.pending_tool_call_ids:
            return []

        repaired_entries: List[Dict[str, object]] = []
        for tool_call_id in list(self.pending_tool_call_ids):
            repaired_entries.append(
                {
                    "role": "tool",
                    "content": (
                        "Tool execution transcript missing during rehydrate. "
                        "Treating the pending tool call as unresolved."
                    ),
                    "message_type": "tool-output",
                    "tool_name": None,
                    "correlation_id": tool_call_id,
                    "timestamp": timestamp,
                    "image_data": None,
                    "tool_call_id": tool_call_id,
                }
            )

        self.pending_tool_call_ids = []
        return repaired_entries
