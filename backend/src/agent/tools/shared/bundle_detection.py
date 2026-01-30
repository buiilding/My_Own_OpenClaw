"""
Bundle detection utilities for tool orchestration.

Pure helper functions for detecting atomic bundles.
No side effects beyond boolean checks.
"""
from typing import List

from backend.src.llm.parser import ParsedResponse, ParsedToolCall


def is_atomic_bundle(parsed_response: ParsedResponse) -> bool:
    """
    Check if a parsed response contains an atomic bundle.
    
    An atomic bundle is defined as:
    - Multiple tool calls (> 1)
    - All tools have bundle_id in metadata
    - No tools have request_id in metadata
    
    Args:
        parsed_response: Parsed LLM response with tool calls
        
    Returns:
        True if this is an atomic bundle, False otherwise
    """
    if len(parsed_response.tool_calls) <= 1:
        return False
    
    return all(
        hasattr(tc, 'metadata') and 
        tc.metadata and 
        'bundle_id' in tc.metadata and 
        'request_id' not in tc.metadata
        for tc in parsed_response.tool_calls
    )


def is_atomic_bundle_from_results(tool_results: List) -> bool:
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
    
    return all(
        hasattr(r.tool_call, 'metadata') and 
        r.tool_call.metadata and 
        'bundle_id' in r.tool_call.metadata and 
        'request_id' not in r.tool_call.metadata
        for r in tool_results
    )
