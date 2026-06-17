"""Helpers for native tool-call bridging and recoverable tool-call error parsing."""

import copy
import re
from typing import Any, Dict, List

from backend.src.core.utils.string_normalization import normalize_non_empty_string
from backend.src.core.types.schemas import NormalizedLLMResponse
from backend.src.llm.parser_types import ParsedResponse, ParsedToolCall

_RECOVERABLE_TOOL_CALL_ERROR_MARKERS = (
    "failed to parse streamed tool-call arguments",
    "failed to parse streamed tool call arguments",
    "invalid tool call arguments",
    "invalid tool-call arguments",
    "invalid tool call at index",
    "invalid tool_calls type",
)
_TOOL_OUTPUT_ERROR_PREVIEW_CHARS = 600
_FILE_PATH_JSON_PATTERN = re.compile(
    r'"file_path"\s*:\s*"([^"\n]+)"'
)
_FILE_PATH_ESCAPED_JSON_PATTERN = re.compile(
    r'\\"file_path\\"\s*:\s*\\"([^"\n]+)\\"'
)
_CAT_REDIRECT_PATTERN = re.compile(
    r"cat\s*>\s*([^\s<>'\"`]+)"
)


def _extract_thought_signature(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in ("thought_signature", "thoughtSignature"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""

def _normalize_tool_call_id(value: Any) -> str | None:
    return normalize_non_empty_string(value)


def _build_model_facing_tool_call(
    *,
    tool_name: str,
    arguments: Dict[str, Any],
    tool_call_id: str | None,
    thought_signature: str | None,
) -> Dict[str, Any]:
    model_facing: Dict[str, Any] = {
        "name": tool_name,
        "arguments": copy.deepcopy(arguments),
    }
    if tool_call_id:
        model_facing["id"] = tool_call_id
    if thought_signature:
        model_facing["thought_signature"] = thought_signature
    return model_facing


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
    raw_tool_name = str(tool_call.get("name", "")).strip()
    normalized_tool_name = raw_tool_name
    if not normalized_tool_name:
        normalized_tool_name = "unknown_tool"

    parameters = tool_call.get("arguments") or {}
    if not isinstance(parameters, dict):
        parameters = {}
    else:
        parameters = copy.deepcopy(parameters)
    original_tool_name = normalized_tool_name
    original_parameters = copy.deepcopy(parameters)

    metadata: Dict[str, Any] = {}
    tool_call_id = _normalize_tool_call_id(tool_call.get("id"))
    if tool_call_id:
        metadata["tool_call_id"] = tool_call_id

    thought_signature = _extract_thought_signature(tool_call)
    if thought_signature:
        metadata["thought_signature"] = thought_signature

    original_model_facing_tool_call = _build_model_facing_tool_call(
        tool_name=original_tool_name,
        arguments=original_parameters,
        tool_call_id=tool_call_id,
        thought_signature=thought_signature or None,
    )

    if raw_tool_name:
        metadata["model_facing_tool_call"] = original_model_facing_tool_call

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
        model_facing = None
        if isinstance(tool_call.metadata, dict):
            candidate = _normalize_tool_call_id(tool_call.metadata.get("tool_call_id"))
            if candidate:
                tool_call_id = candidate
            metadata_model_facing = tool_call.metadata.get("model_facing_tool_call")
            if isinstance(metadata_model_facing, dict):
                model_facing = copy.deepcopy(metadata_model_facing)
        if tool_call_id is None:
            tool_call_id = f"tool_call_{index}"

        history_name = tool_call.tool_name
        history_arguments = copy.deepcopy(tool_call.parameters or {})
        thought_signature = ""
        if model_facing is not None:
            candidate_id = _normalize_tool_call_id(model_facing.get("id"))
            if candidate_id:
                tool_call_id = candidate_id
            candidate_name = model_facing.get("name")
            if isinstance(candidate_name, str) and candidate_name.strip():
                history_name = candidate_name.strip()
            candidate_arguments = model_facing.get("arguments")
            if isinstance(candidate_arguments, dict):
                history_arguments = copy.deepcopy(candidate_arguments)
            thought_signature = _extract_thought_signature(model_facing)
        elif isinstance(tool_call.metadata, dict):
            thought_signature = _extract_thought_signature(tool_call.metadata)

        history_call: Dict[str, Any] = {
            "id": tool_call_id,
            "name": history_name,
            "arguments": history_arguments,
        }
        if thought_signature:
            history_call["thought_signature"] = thought_signature

        history_calls.append(
            history_call
        )
    return history_calls


def extract_history_tool_call_ids(history_tool_calls: List[Dict[str, Any]]) -> List[str]:
    """Collect persisted assistant-history tool-call ids in emission order."""
    tool_call_ids: List[str] = []
    for tool_call in history_tool_calls:
        if not isinstance(tool_call, dict):
            continue
        candidate = _normalize_tool_call_id(tool_call.get("id"))
        if candidate:
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


def _extract_target_file_path(raw_arguments_preview: str | None) -> str:
    if not isinstance(raw_arguments_preview, str) or not raw_arguments_preview.strip():
        return ""
    for pattern in (_FILE_PATH_JSON_PATTERN, _FILE_PATH_ESCAPED_JSON_PATTERN):
        match = pattern.search(raw_arguments_preview)
        if match:
            candidate = (match.group(1) or "").strip()
            if candidate:
                return candidate
    command_match = _CAT_REDIRECT_PATTERN.search(raw_arguments_preview)
    if command_match:
        return (command_match.group(1) or "").strip()
    return ""


def build_recoverable_tool_output_message(
    tool_name: str,
    error_msg: str,
    raw_arguments_preview: str | None = None,
) -> str:
    """Format synthetic tool output in standard tool-output message style."""
    compact_error = " ".join(error_msg.split())
    if len(compact_error) > _TOOL_OUTPUT_ERROR_PREVIEW_CHARS:
        compact_error = (
            f"{compact_error[:_TOOL_OUTPUT_ERROR_PREVIEW_CHARS]}...[truncated]"
        )
    retry_lines = [
        "retry_guidance: retry the same tool with smaller argument payload chunks.",
    ]
    target_file_path = _extract_target_file_path(raw_arguments_preview)
    if target_file_path:
        retry_lines.append(f"target_file: {target_file_path}")
        retry_lines.append(
            "edit_strategy: apply section-by-section edits via multiple replace/apply_patch calls."
        )
    else:
        retry_lines.append(
            "edit_strategy: split large content edits into multiple replace/write_file/apply_patch-style calls."
        )
    retry_text = "\n".join(retry_lines)
    return (
        f"{tool_name} output:\n"
        "error: malformed tool-call arguments from model. "
        f"{compact_error}\n"
        f"{retry_text}\n"
        "status: failed"
    )
