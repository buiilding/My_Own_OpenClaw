"""Contract checks between formatter outputs and outgoing WebSocket schemas."""

import pytest

from backend.src.api.processing.formatters.memory_store import MemoryStoreEventFormatter
from backend.src.api.processing.formatters.context_compaction_completed import (
    ContextCompactionCompletedEventFormatter,
)
from backend.src.api.processing.formatters.context_compaction_failed import (
    ContextCompactionFailedEventFormatter,
)
from backend.src.api.processing.formatters.context_compaction_started import (
    ContextCompactionStartedEventFormatter,
)
from backend.src.api.processing.formatters.token_count import TokenCountEventFormatter
from backend.src.api.processing.formatters.tool_schemas import ToolSchemasEventFormatter
from backend.src.api.schema import (
    ContextCompactionCompletedMessage,
    ContextCompactionFailedMessage,
    ContextCompactionStartedMessage,
    MemoryStoreMessage,
    TokenCountMessage,
    ToolSchemasMessage,
)


def test_tool_schemas_formatter_output_matches_schema() -> None:
    formatter = ToolSchemasEventFormatter()
    payload = formatter.format(
        {
            "tool_schemas": [
                {
                    "type": "function",
                    "function": {
                        "name": "read_file",
                        "parameters": {"type": "object"},
                    },
                }
            ]
        },
        "msg_1",
    )

    assert payload is not None
    parsed = ToolSchemasMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.type == "tool-schemas"


def test_tool_schemas_formatter_rejects_non_list_payload() -> None:
    formatter = ToolSchemasEventFormatter()

    with pytest.raises(ValueError, match="canonical tool object list"):
        formatter.format({"tool_schemas": {"read_file": {"type": "object"}}}, "msg_1")


def test_token_count_formatter_output_matches_schema() -> None:
    formatter = TokenCountEventFormatter()
    payload = formatter.format(
        {
            "prompt_tokens": 12,
            "visible_output_tokens": 3,
            "thinking_tokens": 1,
            "output_tokens_total": 4,
            "total_tokens": 16,
            "conversation_tokens": 200,
            "usage_source": "provider",
            "cached_tokens": 10,
            "cache_hit": True,
            "cache_status": "hit",
        },
        "msg_2",
    )

    assert payload is not None
    parsed = TokenCountMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.total_tokens == 16
    assert parsed.payload.thinking_tokens == 1
    assert parsed.payload.cached_tokens == 10
    assert parsed.payload.cache_hit is True
    assert parsed.payload.cache_status == "hit"


def test_memory_store_formatter_output_matches_schema() -> None:
    formatter = MemoryStoreEventFormatter()
    payload = formatter.format(
        {
            "user_query": "hello",
            "assistant_response": "world",
            "memory_type": "semantic",
            "user_id": "user_1",
            "session_id": "session_1",
        },
        "msg_3",
    )

    assert payload is not None
    parsed = MemoryStoreMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.user_id == "user_1"
    assert parsed.payload.user_query == "hello"
    assert parsed.payload.assistant_response == "world"


def test_memory_store_formatter_trims_query_and_response() -> None:
    formatter = MemoryStoreEventFormatter()
    payload = formatter.format(
        {
            "user_query": "  hello  ",
            "assistant_response": "\nworld\t",
            "memory_type": "semantic",
            "user_id": "user_1",
            "session_id": "session_1",
        },
        "msg_trim",
    )

    assert payload is not None
    parsed = MemoryStoreMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.user_query == "hello"
    assert parsed.payload.assistant_response == "world"


def test_memory_store_formatter_rejects_blank_user_query() -> None:
    formatter = MemoryStoreEventFormatter()
    payload = formatter.format(
        {
            "user_query": "   ",
            "assistant_response": "world",
            "memory_type": "episodic",
            "user_id": "user_1",
            "session_id": "session_1",
        },
        "msg_blank_query",
    )

    assert payload is None


def test_memory_store_formatter_rejects_blank_assistant_response() -> None:
    formatter = MemoryStoreEventFormatter()
    payload = formatter.format(
        {
            "user_query": "hello",
            "assistant_response": "  ",
            "memory_type": "episodic",
            "user_id": "user_1",
            "session_id": "session_1",
        },
        "msg_blank_response",
    )

    assert payload is None


def test_memory_store_formatter_rejects_default_user() -> None:
    formatter = MemoryStoreEventFormatter()
    payload = formatter.format(
        {
            "user_query": "hello",
            "assistant_response": "world",
            "memory_type": "episodic",
            "user_id": "default_user",
            "session_id": "session_1",
        },
        "msg_default_user",
    )

    assert payload is None


def test_memory_store_formatter_rejects_missing_user_id() -> None:
    formatter = MemoryStoreEventFormatter()
    payload = formatter.format(
        {
            "user_query": "hello",
            "assistant_response": "world",
            "memory_type": "episodic",
            "session_id": "session_1",
        },
        "msg_missing_user",
    )

    assert payload is None


def test_context_compaction_started_formatter_output_matches_schema() -> None:
    formatter = ContextCompactionStartedEventFormatter()
    payload = formatter.format(
        {
            "reason": "auto-pre",
            "strategy": "inline",
            "before_tokens": 2200,
            "projected_tokens": 2300,
        },
        "msg_4",
    )

    assert payload is not None
    parsed = ContextCompactionStartedMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.reason == "auto-pre"


def test_context_compaction_completed_formatter_output_matches_schema() -> None:
    formatter = ContextCompactionCompletedEventFormatter()
    payload = formatter.format(
        {
            "reason": "auto-mid",
            "strategy": "inline",
            "before_tokens": 2400,
            "after_tokens": 900,
            "removed_messages": 10,
            "summary_preview": "short summary",
            "skipped_reason": None,
        },
        "msg_5",
    )

    assert payload is not None
    parsed = ContextCompactionCompletedMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.after_tokens == 900
    assert parsed.payload.removed_messages == 10


def test_context_compaction_failed_formatter_output_matches_schema() -> None:
    formatter = ContextCompactionFailedEventFormatter()
    payload = formatter.format(
        {
            "reason": "manual",
            "strategy": "inline",
            "error": "compaction failed",
            "before_tokens": 2000,
        },
        "msg_6",
    )

    assert payload is not None
    parsed = ContextCompactionFailedMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.error == "compaction failed"
