"""Tests for browser content extraction conversion boundaries."""

from __future__ import annotations

from typing import Any

from tools.browser import content_extraction


def test_html_to_markdown_uses_markdownify_dependency(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def fake_markdownify(html: str, **options: Any) -> str:
        captured["html"] = html
        captured["options"] = options
        return "# Title\n\nVisible"

    monkeypatch.setattr(content_extraction, "markdownify_html", fake_markdownify)

    markdown = content_extraction.html_to_markdown(
        "<h1>Title</h1><p>Visible</p>",
        extract_links=True,
    )

    assert markdown == "# Title\n\nVisible"
    assert captured["html"] == "<h1>Title</h1><p>Visible</p>"
    assert captured["options"]["autolinks"] is True
    assert captured["options"]["strip"] == ["script", "style"]


def test_html_to_markdown_sanitizes_markdownify_output() -> None:
    markdown = content_extraction.html_to_markdown(
        "<h1>Title</h1><script>hidden()</script><p>Visible</p>",
        extract_links=False,
    )

    assert "# Title" in markdown
    assert "Visible" in markdown
    assert "hidden()" not in markdown
