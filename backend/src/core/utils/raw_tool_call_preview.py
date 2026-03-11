"""Helpers for compact raw tool-call preview payloads."""

from __future__ import annotations

import json


def build_raw_tool_call_preview(
    *,
    tool_call_id: str,
    tool_name: str,
    raw_arguments_preview: str,
) -> str:
    """Return a deterministic JSON preview of a raw model-emitted tool call."""
    payload = {
        "id": tool_call_id,
        "name": tool_name,
        "arguments": raw_arguments_preview,
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
