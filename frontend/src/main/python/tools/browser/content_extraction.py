"""Windie-owned page content extraction helpers for browser actions."""

from __future__ import annotations

import re
from typing import Any

from markdownify import markdownify as markdownify_html

MAX_EXTRACT_CHARS = 20_000
DEFAULT_EXTRACT_CHARS = 4_000
DEFAULT_LONG_CONTENT_CHARS = 8_000

_TABLE_ROW_RE = re.compile(r"^\s*\|.*\|\s*$")
_LIST_ITEM_RE = re.compile(r"^\s*([-*+]|\d+[.)])\s+")


def _query_terms(query: str) -> list[str]:
    seen: set[str] = set()
    terms: list[str] = []
    for term in re.findall(r"[a-zA-Z0-9]{3,}", query.lower()):
        if term in seen:
            continue
        seen.add(term)
        terms.append(term)
    return terms


def _sanitize_markdown(content: str) -> str:
    cleaned = content
    cleaned = re.sub(r"`\{[\"A-Za-z0-9_].*?\}`", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r'\{"\$type":[^}]{100,}\}', "", cleaned)
    cleaned = re.sub(r'\{"[^"]{5,}":\{[^}]{100,}\}', "", cleaned)
    cleaned = re.sub(r"%[0-9A-Fa-f]{2}", "", cleaned)
    cleaned = re.sub(r"\n{4,}", "\n\n\n", cleaned)
    lines: list[str] = []
    for line in cleaned.splitlines():
        stripped = line.strip()
        if not stripped:
            lines.append("")
            continue
        if (stripped.startswith("{") or stripped.startswith("[")) and len(
            stripped
        ) > 100:
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _remove_ignored_html_blocks(html: str) -> str:
    return re.sub(
        r"<(script|style)\b[^>]*>.*?</\1>",
        " ",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )


def html_to_markdown(html: str, *, extract_links: bool) -> str:
    cleaned_html = _remove_ignored_html_blocks(html)
    markdown = markdownify_html(
        cleaned_html,
        heading_style="ATX",
        strip=["script", "style"],
        bullets="-",
        code_language="",
        escape_asterisks=False,
        escape_underscores=False,
        escape_misc=False,
        autolinks=extract_links,
        default_title=False,
        keep_inline_images_in=[],
    )
    return _sanitize_markdown(markdown)


def _focused_excerpt(content: str, *, query: str, max_chars: int) -> str:
    if not content:
        return ""
    terms = _query_terms(query)
    if not terms:
        return content[:max_chars]

    snippets: list[str] = []
    seen: set[str] = set()
    current_chars = 0
    lines = content.splitlines()
    for line_index, line in enumerate(lines):
        lowered = line.lower()
        if not any(term in lowered for term in terms):
            continue
        start = max(0, line_index - 1)
        end = min(len(lines), line_index + 2)
        snippet = "\n".join(part for part in lines[start:end] if part.strip()).strip()
        if not snippet:
            continue
        dedupe_key = snippet.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        snippets.append(snippet)
        current_chars += len(snippet)
        if current_chars >= max_chars * 2:
            break

    if not snippets:
        return content[:max_chars]

    excerpt = "\n\n".join(snippets)
    return excerpt[:max_chars]


def _structured_excerpt(content: str, *, query: str, max_chars: int) -> str:
    if not content:
        return ""

    terms = _query_terms(query)
    blocks: list[str] = []
    current_block: list[str] = []
    current_chars = 0
    lines = content.splitlines()

    def flush_block() -> None:
        nonlocal current_block
        if current_block:
            blocks.append("\n".join(current_block).strip())
            current_block = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush_block()
            continue
        is_structured = (
            stripped.startswith("#")
            or _TABLE_ROW_RE.match(line)
            or _LIST_ITEM_RE.match(line)
        )
        contains_term = (
            any(term in stripped.lower() for term in terms) if terms else True
        )
        if is_structured or contains_term:
            current_block.append(line)
        else:
            flush_block()
    flush_block()

    if not blocks:
        return _focused_excerpt(content, query=query, max_chars=max_chars)

    selected: list[str] = []
    seen: set[str] = set()
    for block in blocks:
        lowered = block.lower()
        if terms and not any(term in lowered for term in terms):
            continue
        dedupe_key = lowered.strip()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        selected.append(block)
        current_chars += len(block)
        if current_chars >= max_chars * 2:
            break

    excerpt = "\n\n".join(selected or blocks[:5]).strip()
    return excerpt[:max_chars]


async def capture_scoped_html(
    page: Any,
    *,
    selector: str | None = None,
    frame_selector: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Return scoped HTML from the current page or an optional frame/selector."""
    if selector is None and frame_selector is None:
        html = await page.content()
        return str(html or ""), {"selector": None, "frame": None}

    root = page.frame_locator(frame_selector) if frame_selector else page
    locator = root.locator(selector or "body")
    count = await locator.count()
    if count == 0:
        raise RuntimeError("No matching content scope found for extraction.")
    html = await locator.first.evaluate("el => el.outerHTML")
    return str(html or ""), {
        "selector": selector,
        "frame": frame_selector,
        "match_count": count,
    }


async def extract_page_content(
    page: Any,
    *,
    query: str,
    mode: str,
    extract_links: bool,
    start_from_char: int,
    max_chars: int,
    selector: str | None = None,
    frame_selector: str | None = None,
) -> dict[str, Any]:
    html, scope_info = await capture_scoped_html(
        page,
        selector=selector,
        frame_selector=frame_selector,
    )
    markdown = html_to_markdown(html, extract_links=extract_links)
    bounded_start = max(0, min(start_from_char, len(markdown)))
    working_content = markdown[bounded_start:]

    if mode == "full_text":
        excerpt = working_content[:max_chars]
        has_more = bounded_start + len(excerpt) < len(markdown)
        next_offset = bounded_start + len(excerpt) if has_more else None
    elif mode == "structured":
        excerpt = _structured_excerpt(working_content, query=query, max_chars=max_chars)
        has_more = False
        next_offset = None
    else:
        excerpt = _focused_excerpt(working_content, query=query, max_chars=max_chars)
        has_more = False
        next_offset = None

    return {
        "content": excerpt,
        "total_chars": len(markdown),
        "returned_chars": len(excerpt),
        "has_more": has_more,
        "next_offset": next_offset,
        "metadata": {
            "query": query,
            "mode": mode,
            "extract_links": extract_links,
            "start_from_char": bounded_start,
            "max_chars": max_chars,
            "scope": scope_info,
            "extraction_backend": "windie.browser",
        },
    }
