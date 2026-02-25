"""Shared helpers for provider usage capture and cache diagnostics."""

from __future__ import annotations

import copy
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

UsagePath = Tuple[str, ...]

CACHED_TOKEN_PATHS: List[UsagePath] = [
    ("prompt_tokens_details", "cached_tokens"),
    ("input_tokens_details", "cached_tokens"),
    ("cache_read_input_tokens",),
    ("cached_content_token_count",),
    ("cachedContentTokenCount",),
    ("cached_tokens",),
    ("usage_metadata", "cached_content_token_count"),
    ("usageMetadata", "cachedContentTokenCount"),
]
PROMPT_TOKEN_PATHS: List[UsagePath] = [
    ("prompt_tokens",),
    ("input_tokens",),
    ("prompt_token_count",),
    ("inputTokenCount",),
    ("usage_metadata", "prompt_token_count"),
    ("usageMetadata", "promptTokenCount"),
]
COMPLETION_TOKEN_PATHS: List[UsagePath] = [
    ("completion_tokens",),
    ("output_tokens",),
    ("candidates_token_count",),
    ("outputTokenCount",),
    ("usage_metadata", "candidates_token_count"),
    ("usageMetadata", "candidatesTokenCount"),
]
THINKING_TOKEN_PATHS: List[UsagePath] = [
    ("completion_tokens_details", "reasoning_tokens"),
    ("output_tokens_details", "reasoning_tokens"),
    ("reasoning_tokens",),
    ("usage_metadata", "thoughts_token_count"),
    ("usageMetadata", "thoughtsTokenCount"),
    ("thoughts_token_count",),
    ("thoughtsTokenCount",),
]
TOTAL_TOKEN_PATHS: List[UsagePath] = [
    ("total_tokens",),
    ("total_token_count",),
    ("totalTokenCount",),
    ("usage_metadata", "total_token_count"),
    ("usageMetadata", "totalTokenCount"),
]


def normalize_usage_payload(payload: Any) -> Optional[Dict[str, Any]]:
    """Normalize provider usage payloads to plain dictionaries."""
    if payload is None:
        return None

    normalized = payload
    if hasattr(normalized, "model_dump"):
        try:
            normalized = normalized.model_dump()
        except Exception:
            normalized = payload
    elif hasattr(normalized, "dict"):
        try:
            normalized = normalized.dict()
        except Exception:
            normalized = payload
    elif hasattr(normalized, "__dict__") and not isinstance(normalized, dict):
        normalized = vars(normalized)

    if not isinstance(normalized, dict):
        return None

    return copy.deepcopy(normalized)


def extract_usage_int(
    usage: Dict[str, Any],
    paths: Sequence[UsagePath],
) -> Optional[int]:
    """Extract the first integer value from nested dictionary key paths."""
    for path in paths:
        current: Any = usage
        found = True
        for key in path:
            if not isinstance(current, dict) or key not in current:
                found = False
                break
            current = current[key]
        if not found or current is None:
            continue

        if isinstance(current, bool):
            continue
        if isinstance(current, int):
            return current
        if isinstance(current, float) and current.is_integer():
            return int(current)
        if isinstance(current, str):
            stripped = current.strip()
            if stripped.isdigit():
                return int(stripped)
    return None


def _iter_usage_payload_candidates(payload_container: Any) -> Iterable[Any]:
    """Yield usage-like payloads from dict/object response containers."""
    if isinstance(payload_container, dict):
        yield payload_container.get("usage")
        yield payload_container.get("usage_metadata")
        yield payload_container.get("usageMetadata")
        return

    yield getattr(payload_container, "usage", None)
    yield getattr(payload_container, "usage_metadata", None)
    yield getattr(payload_container, "usageMetadata", None)
    model_extra = getattr(payload_container, "model_extra", None)
    if isinstance(model_extra, dict):
        yield model_extra.get("usage")
        yield model_extra.get("usage_metadata")
        yield model_extra.get("usageMetadata")


def collect_usage_payload(payload_container: Any) -> Optional[Dict[str, Any]]:
    """Capture first usable normalized usage payload from a response/chunk."""
    for payload in _iter_usage_payload_candidates(payload_container):
        normalized = normalize_usage_payload(payload)
        if normalized:
            return normalized
    return None


def build_stream_cache_diagnostics(
    *,
    model: str,
    usage: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build normalized cache diagnostics payload from provider usage dict."""
    if usage is None:
        return {
            "model": model,
            "status": "unknown",
            "cache_hit": None,
            "cached_tokens": None,
            "prompt_tokens": None,
            "completion_tokens": None,
            "thinking_tokens": None,
            "total_tokens": None,
            "reason": "provider_usage_unavailable",
        }

    cached_tokens = extract_usage_int(usage, CACHED_TOKEN_PATHS)
    prompt_tokens = extract_usage_int(usage, PROMPT_TOKEN_PATHS)
    completion_tokens = extract_usage_int(usage, COMPLETION_TOKEN_PATHS)
    thinking_tokens = extract_usage_int(usage, THINKING_TOKEN_PATHS)
    total_tokens = extract_usage_int(usage, TOTAL_TOKEN_PATHS)

    if cached_tokens is None:
        status = "unknown"
        cache_hit = None
    elif cached_tokens > 0:
        status = "hit"
        cache_hit = True
    else:
        status = "miss"
        cache_hit = False

    return {
        "model": model,
        "status": status,
        "cache_hit": cache_hit,
        "cached_tokens": cached_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "thinking_tokens": thinking_tokens,
        "total_tokens": total_tokens,
        "reason": None,
    }
