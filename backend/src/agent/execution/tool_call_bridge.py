"""Helpers for native tool-call bridging and recoverable tool-call error parsing."""

import re
from typing import Any, Dict, List

from backend.src.core.types.schemas import NormalizedLLMResponse
from backend.src.llm.parser_types import ParsedResponse, ParsedToolCall

_LLM_TOOL_ERROR_ID_PATTERN = re.compile(
    r"(?:\bid\b|\btool_call_id\b)\s*[:=]\s*['\"]?([A-Za-z0-9_.:/-]+)",
    re.IGNORECASE,
)
_LLM_TOOL_ERROR_NAME_PATTERN = re.compile(
    r"(?:\bname\b|\btool_name\b)\s*[:=]\s*['\"]?([A-Za-z0-9_.:/-]+)",
    re.IGNORECASE,
)
_RECOVERABLE_TOOL_CALL_ERROR_MARKERS = (
    "failed to parse streamed tool-call arguments",
    "failed to parse streamed tool call arguments",
    "invalid tool call arguments",
    "invalid tool-call arguments",
    "invalid tool call at index",
    "invalid tool_calls type",
)
_TOOL_OUTPUT_ERROR_PREVIEW_CHARS = 600


def to_parsed_response(normalized_response: NormalizedLLMResponse) -> ParsedResponse:
    """Bridge native SDK tool calls into existing ParsedResponse-based tool pipeline."""
    content = normalized_response.get("content", "")
    tool_calls_payload = normalized_response.get("tool_calls") or []
    parsed_tool_calls = [
        to_parsed_tool_call(tool_call) for tool_call in tool_calls_payload
    ]
    return ParsedResponse(
        original_response=content,
        text_content=content,
        tool_calls=parsed_tool_calls,
        has_tool_calls=len(parsed_tool_calls) > 0,
    )


def to_parsed_tool_call(tool_call: Dict[str, Any]) -> ParsedToolCall:
    """Normalize one native tool call into ParsedToolCall shape."""
    normalized_tool_name = str(tool_call.get("name", "")).strip()
    if not normalized_tool_name:
        normalized_tool_name = "unknown_tool"

    parameters = tool_call.get("arguments") or {}
    if not isinstance(parameters, dict):
        parameters = {}

    metadata: Dict[str, Any] = {}
    tool_call_id = tool_call.get("id")
    if isinstance(tool_call_id, str) and tool_call_id:
        metadata["tool_call_id"] = tool_call_id

    metadata_payload = parameters.get("metadata")
    if isinstance(metadata_payload, dict):
        metadata.update(metadata_payload)
    return ParsedToolCall(
        tool_name=normalized_tool_name,
        parameters=parameters,
        metadata=metadata or None,
    )


def to_history_tool_calls(
    parsed_tool_calls: List[ParsedToolCall],
) -> List[Dict[str, Any]]:
    """Render parsed tool calls into assistant-history tool_calls format."""
    history_calls: List[Dict[str, Any]] = []
    for index, tool_call in enumerate(parsed_tool_calls):
        tool_call_id = None
        if isinstance(tool_call.metadata, dict):
            candidate = tool_call.metadata.get("tool_call_id")
            if isinstance(candidate, str) and candidate:
                tool_call_id = candidate
        if tool_call_id is None:
            tool_call_id = f"tool_call_{index}"

        history_calls.append(
            {
                "id": tool_call_id,
                "name": tool_call.tool_name,
                "arguments": dict(tool_call.parameters or {}),
            }
        )
    return history_calls


def extract_tool_call_ids(parsed_tool_calls: List[ParsedToolCall]) -> List[str]:
    """Collect tool-call ids in emission order for tool-result linkage."""
    tool_call_ids: List[str] = []
    for tool_call in parsed_tool_calls:
        if not isinstance(tool_call.metadata, dict):
            continue
        candidate = tool_call.metadata.get("tool_call_id")
        if isinstance(candidate, str) and candidate:
            tool_call_ids.append(candidate)
    return tool_call_ids


def is_recoverable_llm_tool_call_error(error_msg: str) -> bool:
    """
    Return True for model-generated tool-call format errors.

    These are recoverable by feeding synthetic tool output back to the model.
    """
    normalized = error_msg.lower()
    has_tool_context = "tool" in normalized
    has_format_context = (
        "argument" in normalized
        or "tool_call" in normalized
        or "tool-call" in normalized
        or "tool_calls" in normalized
    )
    if not has_tool_context or not has_format_context:
        return False
    return any(marker in normalized for marker in _RECOVERABLE_TOOL_CALL_ERROR_MARKERS)


def extract_tool_name_from_error(error_msg: str) -> str:
    """Best-effort extraction of tool name from provider error text."""
    match = _LLM_TOOL_ERROR_NAME_PATTERN.search(error_msg)
    if match:
        candidate = (match.group(1) or "").strip().strip(".,;:()[]{}")
        if candidate:
            return candidate
    return "invalid_tool_call"


def extract_tool_call_id_from_error(error_msg: str) -> str:
    """Best-effort extraction of tool call id from provider error text."""
    match = _LLM_TOOL_ERROR_ID_PATTERN.search(error_msg)
    if match:
        return (match.group(1) or "").strip().strip(".,;:()[]{}")
    return ""


def build_recoverable_tool_output_message(tool_name: str, error_msg: str) -> str:
    """Format synthetic tool output in standard tool-output message style."""
    compact_error = " ".join(error_msg.split())
    if len(compact_error) > _TOOL_OUTPUT_ERROR_PREVIEW_CHARS:
        compact_error = (
            f"{compact_error[:_TOOL_OUTPUT_ERROR_PREVIEW_CHARS]}...[truncated]"
        )
    return (
        f"{tool_name} output:\n"
        "error: malformed tool-call arguments from model. "
        f"{compact_error}\n"
        "status: failed"
    )
