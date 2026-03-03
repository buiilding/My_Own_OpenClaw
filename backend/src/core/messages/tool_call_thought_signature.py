"""Shared helpers for tool-call thought-signature extraction/attachment."""

from __future__ import annotations

from typing import Any, Dict


def extract_tool_call_thought_signature(*sources: Any) -> str:
    """Return first non-empty thought signature from source payload dicts."""
    for source in sources:
        if not isinstance(source, dict):
            continue
        for key in ("thought_signature", "thoughtSignature"):
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def apply_tool_call_thought_signature(
    *,
    normalized_call: Dict[str, Any],
    thought_signature: str,
) -> bool:
    """Attach thought signature to call and nested function blocks."""
    if not thought_signature:
        return False

    changed = False
    if normalized_call.get("thought_signature") != thought_signature:
        normalized_call["thought_signature"] = thought_signature
        changed = True

    function_block = normalized_call.get("function")
    if isinstance(function_block, dict) and function_block.get("thought_signature") != thought_signature:
        function_block["thought_signature"] = thought_signature
        changed = True
    return changed
