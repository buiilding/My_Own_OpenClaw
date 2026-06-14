"""Covers history admission behavior in the backend test suite."""

from backend.src.agent.history.history_admission import (
    normalize_assistant_history_structured_content,
    normalize_history_structured_content,
    normalize_history_text_content,
    should_store_assistant_history_message,
)


def test_assistant_structured_text_blocks_normalize_to_output_text() -> None:
    assert normalize_assistant_history_structured_content(
        [
            "plain",
            {"type": "text", "text": " text"},
            {"type": "input_text", "text": " input"},
            {"type": "output_text", "text": " output"},
        ]
    ) == [
        {"type": "output_text", "text": "plain"},
        {"type": "output_text", "text": " text"},
        {"type": "output_text", "text": " input"},
        {"type": "output_text", "text": " output"},
    ]


def test_refusal_blocks_are_preserved_for_replay() -> None:
    assert normalize_history_structured_content(
        {"type": "refusal", "refusal": "I cannot do that."},
        role="assistant",
    ) == [{"type": "refusal", "refusal": "I cannot do that."}]


def test_non_assistant_image_blocks_are_preserved() -> None:
    assert normalize_history_structured_content(
        [
            {"type": "image_url", "image_url": {"url": "https://example.test/a.png"}},
            {"type": "input_image", "url": "data:image/png;base64,abc"},
        ],
        role="user",
    ) == [
        {
            "type": "image_url",
            "image_url": {"url": "https://example.test/a.png"},
        },
        {
            "type": "image_url",
            "image_url": {"url": "data:image/png;base64,abc"},
        },
    ]


def test_assistant_image_blocks_are_omitted() -> None:
    assert (
        normalize_history_structured_content(
            {"type": "input_image", "url": "data:image/png;base64,abc"},
            role="assistant",
        )
        is None
    )


def test_empty_unknown_and_scalar_structured_content_is_rejected() -> None:
    assert normalize_history_structured_content([], role="user") is None
    assert normalize_history_structured_content({"type": "unknown"}, role="user") is None
    assert normalize_history_structured_content(123, role="user") is None


def test_mixed_text_content_is_flattened_with_refusals() -> None:
    assert (
        normalize_history_text_content(
            [
                {"type": "text", "text": "Hello"},
                {"type": "refusal", "refusal": " no"},
                {"type": "input_text", "text": " world"},
            ]
        )
        == "Hello no world"
    )


def test_scalar_text_content_is_stringified() -> None:
    assert normalize_history_text_content(42) == "42"


def test_assistant_history_admission_accepts_text_or_tool_calls() -> None:
    assert should_store_assistant_history_message(" done ") is True
    assert should_store_assistant_history_message("", tool_calls=[{"id": "call_1"}])
    assert should_store_assistant_history_message("   ", tool_calls=[]) is False
    assert should_store_assistant_history_message("   ", tool_calls=["not-a-call"]) is False
