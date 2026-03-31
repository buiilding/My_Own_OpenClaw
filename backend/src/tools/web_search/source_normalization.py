"""Normalization helpers for provider-native web-search source metadata."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _normalize_source_entry(
    *,
    url: Any,
    title: Any,
    provider: str,
    query: Any = None,
    rank: Any = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(url, str) or not url.strip():
        return None
    normalized: Dict[str, Any] = {
        "url": url.strip(),
        "provider": provider,
    }
    if isinstance(title, str) and title.strip():
        normalized["title"] = title.strip()
    if isinstance(query, str) and query.strip():
        normalized["query"] = query.strip()
    if isinstance(rank, int):
        normalized["rank"] = rank
    return normalized


def dedupe_sources(sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen_urls: set[str] = set()
    deduped: List[Dict[str, Any]] = []
    for source in sources:
        if not isinstance(source, dict):
            continue
        url = source.get("url")
        if not isinstance(url, str) or not url.strip():
            continue
        normalized_url = url.strip()
        if normalized_url in seen_urls:
            continue
        seen_urls.add(normalized_url)
        deduped.append(dict(source))
    return deduped


def extract_tool_result_web_search_sources(
    payload: Any,
    *,
    default_provider: str = "brave",
) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return []

    raw_results = payload.get("results")
    if not isinstance(raw_results, list):
        return []

    payload_provider = payload.get("provider")
    provider = (
        payload_provider.strip()
        if isinstance(payload_provider, str) and payload_provider.strip()
        else default_provider
    )
    payload_query = payload.get("query")
    query = payload_query.strip() if isinstance(payload_query, str) and payload_query.strip() else None

    sources: List[Dict[str, Any]] = []
    for raw_result in raw_results:
        if not isinstance(raw_result, dict):
            continue
        row_provider = raw_result.get("provider")
        row_query = raw_result.get("query")
        normalized = _normalize_source_entry(
            url=raw_result.get("url"),
            title=raw_result.get("title"),
            provider=(
                row_provider.strip()
                if isinstance(row_provider, str) and row_provider.strip()
                else provider
            ),
            query=(
                row_query.strip()
                if isinstance(row_query, str) and row_query.strip()
                else query
            ),
            rank=raw_result.get("rank"),
        )
        if normalized:
            sources.append(normalized)
    return dedupe_sources(sources)


def extract_openai_web_search_sources(response: Any) -> List[Dict[str, Any]]:
    sources: List[Dict[str, Any]] = []
    output_items = getattr(response, "output", None)
    if not isinstance(output_items, list) and isinstance(response, dict):
        output_items = response.get("output")
    if not isinstance(output_items, list):
        return sources

    for output_item in output_items:
        if not isinstance(output_item, dict):
            continue
        item_type = str(output_item.get("type") or "").strip()
        if item_type == "web_search_call":
            action = output_item.get("action")
            raw_sources = []
            if isinstance(action, dict) and isinstance(action.get("sources"), list):
                raw_sources = action["sources"]
            elif isinstance(output_item.get("sources"), list):
                raw_sources = output_item["sources"]
            query = output_item.get("query")
            for index, raw_source in enumerate(raw_sources, start=1):
                if not isinstance(raw_source, dict):
                    continue
                normalized = _normalize_source_entry(
                    url=raw_source.get("url") or raw_source.get("uri"),
                    title=raw_source.get("title"),
                    provider="openai",
                    query=query,
                    rank=index,
                )
                if normalized:
                    sources.append(normalized)
            continue

        if item_type != "message":
            continue
        content_blocks = output_item.get("content")
        if not isinstance(content_blocks, list):
            continue
        for block in content_blocks:
            if not isinstance(block, dict):
                continue
            annotations = block.get("annotations")
            if not isinstance(annotations, list):
                continue
            for annotation in annotations:
                if not isinstance(annotation, dict):
                    continue
                normalized = _normalize_source_entry(
                    url=annotation.get("url") or annotation.get("uri"),
                    title=annotation.get("title"),
                    provider="openai",
                )
                if normalized:
                    sources.append(normalized)
    return dedupe_sources(sources)


def extract_gemini_web_search_sources(payload: Any) -> List[Dict[str, Any]]:
    candidates = None
    if isinstance(payload, dict):
        candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return []

    sources: List[Dict[str, Any]] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        grounding_metadata = (
            candidate.get("groundingMetadata")
            if isinstance(candidate.get("groundingMetadata"), dict)
            else candidate.get("grounding_metadata")
        )
        if not isinstance(grounding_metadata, dict):
            continue
        queries = grounding_metadata.get("webSearchQueries") or grounding_metadata.get("web_search_queries") or []
        primary_query = queries[0] if isinstance(queries, list) and queries else None
        grounding_chunks = grounding_metadata.get("groundingChunks") or grounding_metadata.get("grounding_chunks") or []
        if not isinstance(grounding_chunks, list):
            continue
        for index, chunk in enumerate(grounding_chunks, start=1):
            if not isinstance(chunk, dict):
                continue
            web_payload = chunk.get("web") if isinstance(chunk.get("web"), dict) else None
            if web_payload is None:
                continue
            normalized = _normalize_source_entry(
                url=web_payload.get("uri") or web_payload.get("url"),
                title=web_payload.get("title"),
                provider="gemini",
                query=primary_query,
                rank=index,
            )
            if normalized:
                sources.append(normalized)
    return dedupe_sources(sources)
