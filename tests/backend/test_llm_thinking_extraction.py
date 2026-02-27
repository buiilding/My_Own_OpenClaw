"""Unit tests for extracted thinking parsing helpers."""

from types import SimpleNamespace

from backend.src.llm.providers.thinking_extraction import extract_thinking_content


def test_extract_thinking_content_from_reasoning_details_list_blocks():
    delta = {
        "reasoning_details": [
            {"type": "reasoning.text", "text": "Reasoning from details list"},
        ]
    }

    assert extract_thinking_content(delta) == "Reasoning from details list"


def test_extract_thinking_content_from_structured_content_blocks():
    delta = {
        "content": [
            {"type": "reasoning", "text": "Block reasoning text"},
        ]
    }

    assert extract_thinking_content(delta) == "Block reasoning text"


def test_extract_thinking_content_from_thinking_tags():
    delta = {"content": "prefix <thinking>tagged reasoning</thinking> suffix"}

    assert extract_thinking_content(delta) == "tagged reasoning"


def test_extract_thinking_content_from_object_fields():
    delta = SimpleNamespace(
        reasoning_content=None,
        reasoningContent=None,
        reasoning_details=[{"text": "Object reasoning details"}],
        thinking_content=None,
        thinking=None,
        reasoning=None,
        thought=None,
        thoughts=None,
    )

    assert extract_thinking_content(delta) == "Object reasoning details"
