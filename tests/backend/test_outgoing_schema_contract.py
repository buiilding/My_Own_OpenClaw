"""Contract checks between formatter outputs and outgoing WebSocket schemas."""

from backend.src.api.processing.formatters.memory_store import MemoryStoreEventFormatter
from backend.src.api.processing.formatters.token_count import TokenCountEventFormatter
from backend.src.api.processing.formatters.tool_schemas import ToolSchemasEventFormatter
from backend.src.api.schema import (
    MemoryStoreMessage,
    TokenCountMessage,
    ToolSchemasMessage,
)


def test_tool_schemas_formatter_output_matches_schema() -> None:
    formatter = ToolSchemasEventFormatter()
    payload = formatter.format(
        {"tool_schemas": {"read_file": {"type": "object"}}}, "msg_1"
    )

    assert payload is not None
    parsed = ToolSchemasMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.type == "tool-schemas"


def test_token_count_formatter_output_matches_schema() -> None:
    formatter = TokenCountEventFormatter()
    payload = formatter.format(
        {
            "input_tokens": 12,
            "output_tokens": 4,
            "total_tokens": 16,
            "conversation_tokens": 200,
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
