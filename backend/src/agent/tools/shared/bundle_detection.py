"""
Bundle detection utilities for tool orchestration.

Pure helper functions for detecting atomic bundles.
No side effects beyond boolean checks.
"""

from typing import List

from backend.src.agent.tools.preparation.types.execution_ref import ExecutionRef
from backend.src.llm.parser_types import ParsedResponse, ParsedToolCall
from backend.src.tools.result_types import ToolExecutionResult


def is_atomic_bundle(parsed_response: ParsedResponse) -> bool:
    """
    Check if a parsed response contains an atomic bundle.

    An atomic bundle is defined as:
    - Multiple tool calls (> 1)
    - All tools have the same bundle_id in metadata
    - No tools have request_id in metadata

    Args:
        parsed_response: Parsed LLM response with tool calls

    Returns:
        True if this is an atomic bundle, False otherwise
    """
    if len(parsed_response.tool_calls) <= 1:
        return False

    bundle_id = _bundle_id_from_metadata(parsed_response.tool_calls[0].metadata)
    if bundle_id is None:
        return False
    return all(
        _bundle_id_from_metadata(tc.metadata) == bundle_id
        for tc in parsed_response.tool_calls
    )


def is_atomic_bundle_from_results(tool_results: List[ToolExecutionResult]) -> bool:
    """
    Check if tool results represent an atomic bundle.

    Used when checking orchestration results that have already been executed.

    Args:
        tool_results: List of tool result objects

    Returns:
        True if results represent an atomic bundle, False otherwise
    """
    if len(tool_results) <= 1:
        return False

    first_tool_call = getattr(tool_results[0], "tool_call", None)
    if not isinstance(first_tool_call, ParsedToolCall):
        return False
    bundle_id = _bundle_id_from_metadata(first_tool_call.metadata)
    if bundle_id is None:
        return False

    for result in tool_results:
        tool_call = getattr(result, "tool_call", None)
        if not isinstance(tool_call, ParsedToolCall):
            return False
        if _bundle_id_from_metadata(tool_call.metadata) != bundle_id:
            return False
    return True


def _bundle_id_from_metadata(metadata) -> str | None:
    ref = ExecutionRef.from_metadata(metadata)
    if ref is None or ref.kind != "bundle":
        return None
    return ref.bundle_id
