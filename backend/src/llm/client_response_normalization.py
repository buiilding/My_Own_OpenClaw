import copy
from typing import Any, Dict, List, Optional

from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.core.types.schemas import NormalizedLLMResponse


def normalize_content(
    response: Dict[str, Any],
    *,
    model: str,
) -> str:
    """Normalize required content field from provider response payload."""
    if "content" not in response:
        raise LLMAPIError(
            f"Invalid response structure from provider: missing 'content' key. Keys: {list(response.keys())}",
            model=model,
        )

    content = response["content"]
    if content is None:
        content = ""
    if not isinstance(content, str):
        raise LLMAPIError(
            f"Invalid content type from provider: expected str, got {type(content).__name__}",
            model=model,
        )
    return content


def normalize_tool_call_entry(
    tool_call: Any,
    *,
    index: int,
    model: str,
) -> Dict[str, Any]:
    """Normalize one tool call object into canonical id/name/arguments fields."""
    if not isinstance(tool_call, dict):
        raise LLMAPIError(
            f"Invalid tool call at index {index}: expected dict",
            model=model,
        )

    tool_id = tool_call.get("id")
    tool_name = tool_call.get("name")
    arguments = tool_call.get("arguments", {})
    if not isinstance(tool_id, str) or not tool_id:
        raise LLMAPIError(
            f"Invalid tool call id at index {index}: expected non-empty str",
            model=model,
        )
    if not isinstance(tool_name, str) or not tool_name:
        raise LLMAPIError(
            f"Invalid tool call name at index {index}: expected non-empty str",
            model=model,
        )
    if not isinstance(arguments, dict):
        raise LLMAPIError(
            f"Invalid tool call arguments at index {index}: expected dict",
            model=model,
        )
    return {"id": tool_id, "name": tool_name, "arguments": copy.deepcopy(arguments)}


def normalize_tool_calls(
    tool_calls: Any,
    *,
    model: str,
) -> Optional[List[Dict[str, Any]]]:
    """Normalize provider tool calls into canonical [{id,name,arguments}] form."""
    if tool_calls is None:
        return None
    if not isinstance(tool_calls, list):
        raise LLMAPIError(
            "Invalid tool_calls type from provider: expected list",
            model=model,
        )
    return [
        normalize_tool_call_entry(tool_call, index=index, model=model)
        for index, tool_call in enumerate(tool_calls)
    ]


def normalize_finish_reason(
    finish_reason: Any,
    *,
    model: str,
) -> Optional[str]:
    """Normalize finish reason type from provider response."""
    if finish_reason is None:
        return None
    if not isinstance(finish_reason, str):
        raise LLMAPIError(
            "Invalid finish_reason type from provider: expected str or None",
            model=model,
        )
    return finish_reason


def normalize_response_payload(
    response: Any,
    *,
    model: str,
) -> NormalizedLLMResponse:
    """Validate provider response against the canonical normalized contract."""
    if not isinstance(response, dict):
        raise LLMAPIError(
            f"Invalid response type from provider: expected dict, got {type(response).__name__}",
            model=model,
        )

    normalized: NormalizedLLMResponse = {
        "content": normalize_content(response, model=model)
    }
    normalized_tool_calls = normalize_tool_calls(
        response.get("tool_calls"),
        model=model,
    )
    if normalized_tool_calls is not None:
        normalized["tool_calls"] = normalized_tool_calls
    if "finish_reason" in response:
        normalized["finish_reason"] = normalize_finish_reason(
            response["finish_reason"],
            model=model,
        )
    return normalized
