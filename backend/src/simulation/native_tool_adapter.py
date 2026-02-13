"""
Adapters that translate legacy simulation JSON text into native tool-call payloads.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from backend.src.core.types.schemas import NormalizedLLMResponse


def extract_response_text(legacy_response: str) -> str:
    """Extract user-facing text from legacy simulation payloads."""
    normalized = build_normalized_response(
        legacy_response,
        call_id_prefix="extract_only",
        iteration=0,
    )
    return normalized.get("content", "")


def build_normalized_response(
    legacy_response: str,
    *,
    call_id_prefix: str,
    iteration: int,
) -> NormalizedLLMResponse:
    """
    Convert legacy simulation text into native `NormalizedLLMResponse`.

    Legacy payloads may include one-or-more JSON objects separated by newlines:
    - {"functionCall": {...}}
    - {"metadata": {...}, "action": {"functionCall": {...}}}
    - {"response": "..."}
    """
    raw = legacy_response.strip()
    if not raw:
        return {"content": ""}

    parsed_objects = _parse_legacy_objects(raw)
    if parsed_objects is None:
        return {"content": legacy_response}

    tool_calls: List[Dict[str, Any]] = []
    text_parts: List[str] = []

    for obj in parsed_objects:
        extracted = _extract_function_call(obj)
        if extracted is not None:
            tool_name, args, metadata = extracted
            normalized_args: Dict[str, Any] = dict(args)
            if isinstance(metadata, dict) and metadata:
                normalized_args["metadata"] = dict(metadata)

            tool_calls.append(
                {
                    "id": f"{call_id_prefix}_{iteration}_{len(tool_calls) + 1}",
                    "name": tool_name,
                    "arguments": normalized_args,
                }
            )
            continue

        response_text = obj.get("response")
        if isinstance(response_text, str) and response_text.strip():
            text_parts.append(response_text.strip())
            continue

        text_parts.append(json.dumps(obj))

    content = "\n\n".join(part for part in text_parts if part).strip()
    normalized: NormalizedLLMResponse = {"content": content}
    if tool_calls:
        normalized["tool_calls"] = tool_calls
        normalized["finish_reason"] = "tool_calls"
    elif content:
        normalized["finish_reason"] = "stop"
    return normalized


def _parse_legacy_objects(raw: str) -> Optional[List[Dict[str, Any]]]:
    """Parse one-or-many JSON objects; return None for plain text."""
    # First, try line-delimited JSON objects.
    parsed_lines: List[Dict[str, Any]] = []
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    if lines:
        all_lines_json = True
        for line in lines:
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                all_lines_json = False
                break
            if not isinstance(parsed, dict):
                all_lines_json = False
                break
            parsed_lines.append(parsed)
        if all_lines_json and parsed_lines:
            return parsed_lines

    # Fallback: try a single JSON object.
    try:
        parsed_single = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed_single, dict):
        return [parsed_single]
    return None


def _extract_function_call(
    payload: Dict[str, Any],
) -> Optional[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]]:
    """
    Extract `(tool_name, args, metadata)` from legacy simulation payloads.
    """
    metadata = payload.get("metadata")
    if "action" in payload and isinstance(payload.get("action"), dict):
        function_call = payload["action"].get("functionCall")
        extracted = _extract_tool_name_and_args(function_call)
        if extracted is None:
            return None
        tool_name, args = extracted
        return tool_name, args, metadata if isinstance(metadata, dict) else None

    function_call = payload.get("functionCall")
    extracted = _extract_tool_name_and_args(function_call)
    if extracted is None:
        return None
    tool_name, args = extracted
    return tool_name, args, None


def _extract_tool_name_and_args(
    function_call: Any,
) -> Optional[Tuple[str, Dict[str, Any]]]:
    if not isinstance(function_call, dict):
        return None

    tool_name = function_call.get("name")
    args = function_call.get("args", {})
    if not isinstance(tool_name, str) or not tool_name.strip():
        return None
    if not isinstance(args, dict):
        return None
    return tool_name.strip(), args
