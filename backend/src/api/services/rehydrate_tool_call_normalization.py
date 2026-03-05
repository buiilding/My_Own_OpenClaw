"""Tool-call parsing and normalization helpers for rehydrate replay."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional


def extract_thought_signature(*sources: Optional[Dict[str, Any]]) -> Optional[str]:
    for source in sources:
        if not isinstance(source, dict):
            continue
        for key in ("thought_signature", "thoughtSignature"):
            raw_signature = source.get(key)
            if isinstance(raw_signature, str) and raw_signature.strip():
                return raw_signature.strip()
    return None


def extract_tool_call_details(
    *,
    content: str,
    fallback_tool_name: Optional[str],
) -> tuple[str, Dict[str, Any], Optional[str], Optional[str]]:
    tool_name = fallback_tool_name or "unknown_tool"
    arguments: Dict[str, Any] = {}
    tool_call_id: Optional[str] = None
    thought_signature: Optional[str] = None
    if not isinstance(content, str) or not content.strip():
        return tool_name, arguments, tool_call_id, thought_signature

    try:
        payload = json.loads(content)
    except (TypeError, ValueError):
        return tool_name, arguments, tool_call_id, thought_signature

    if not isinstance(payload, dict):
        return tool_name, arguments, tool_call_id, thought_signature

    function_payload = payload.get("function")
    if not isinstance(function_payload, dict):
        function_payload = None

    parsed_name = normalize_optional_string(
        payload.get("name")
        if function_payload is None
        else payload.get("name") or function_payload.get("name")
    )
    if parsed_name:
        tool_name = parsed_name
    parsed_call_id = normalize_optional_string(
        payload.get("id")
        if function_payload is None
        else payload.get("id") or function_payload.get("id")
    )
    if parsed_call_id:
        tool_call_id = parsed_call_id
    parsed_arguments = payload.get("args")
    if isinstance(parsed_arguments, dict):
        arguments = dict(parsed_arguments)
    elif isinstance(payload.get("arguments"), dict):
        arguments = dict(payload["arguments"])
    elif function_payload is not None:
        function_arguments = function_payload.get("arguments")
        if isinstance(function_arguments, dict):
            arguments = dict(function_arguments)
        elif isinstance(function_arguments, str) and function_arguments.strip():
            try:
                decoded_arguments = json.loads(function_arguments)
            except (TypeError, ValueError):
                decoded_arguments = None
            if isinstance(decoded_arguments, dict):
                arguments = decoded_arguments

    thought_signature = extract_thought_signature(
        payload,
        function_payload,
    )

    return tool_name, arguments, tool_call_id, thought_signature


def normalize_tool_calls(raw_tool_calls: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_tool_calls, list):
        return []

    normalized_calls: List[Dict[str, Any]] = []
    for index, raw_call in enumerate(raw_tool_calls):
        if not isinstance(raw_call, dict):
            continue
        call_id = raw_call.get("id")
        if not isinstance(call_id, str) or not call_id.strip():
            continue

        call_name: Optional[str] = None
        call_arguments: Dict[str, Any] = {}
        thought_signature: Optional[str] = extract_thought_signature(raw_call)

        if isinstance(raw_call.get("name"), str) and raw_call.get("name", "").strip():
            call_name = raw_call["name"].strip()
            if isinstance(raw_call.get("arguments"), dict):
                call_arguments = dict(raw_call["arguments"])
        elif raw_call.get("type") == "function" and isinstance(raw_call.get("function"), dict):
            function_block = raw_call["function"]
            if isinstance(function_block.get("name"), str) and function_block.get("name", "").strip():
                call_name = function_block["name"].strip()
            if thought_signature is None:
                thought_signature = extract_thought_signature(function_block)
            function_arguments = function_block.get("arguments")
            if isinstance(function_arguments, dict):
                call_arguments = dict(function_arguments)
            elif isinstance(function_arguments, str) and function_arguments.strip():
                try:
                    decoded_arguments = json.loads(function_arguments)
                except (TypeError, ValueError):
                    decoded_arguments = None
                if isinstance(decoded_arguments, dict):
                    call_arguments = decoded_arguments

        if not call_name:
            call_name = f"unknown_tool_{index}"

        normalized_call: Dict[str, Any] = {
            "id": call_id.strip(),
            "name": call_name,
            "arguments": call_arguments,
        }
        if thought_signature is not None:
            normalized_call["thought_signature"] = thought_signature
        normalized_calls.append(normalized_call)
    return normalized_calls


def normalize_optional_string(value: Optional[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None
