"""HTML-to-markdown helpers for local-runtime browser actions."""

from __future__ import annotations

import re

from markdownify import markdownify as markdownify_html

MAX_EXTRACT_CHARS = 20_000
DEFAULT_EXTRACT_CHARS = 4_000
DEFAULT_LONG_CONTENT_CHARS = 8_000


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
