import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.operations import (  # noqa: E402
    build_store_memory_response_data,
    build_interaction_metadata,
    format_interaction_memory,
    group_memory_texts,
    normalize_and_store_interaction_memory,
    normalize_search_memory_payload,
    normalize_store_memory_payload,
    store_interaction_memory,
)


@pytest.mark.parametrize(
    ("user_query", "assistant_response", "memory_type", "expected_error"),
    [
        (None, "hello", "episodic", "Missing user_query or assistant_response"),
        ("hi", None, "episodic", "Missing user_query or assistant_response"),
        (1, "hello", "episodic", "user_query and assistant_response must be strings"),
        ("hi", "hello", 1, "memory_type must be a string"),
        ("hi", "hello", "archive", "Invalid memory_type: archive"),
        ("   ", "hello", "episodic", "Missing user_query or assistant_response"),
    ],
)
def test_normalize_store_memory_payload_rejects_invalid_inputs(
    user_query,
    assistant_response,
    memory_type,
    expected_error,
):
    normalized, error = normalize_store_memory_payload(
        user_query=user_query,
        assistant_response=assistant_response,
        memory_type=memory_type,
    )
    assert normalized is None
    assert error == expected_error


def test_normalize_store_memory_payload_returns_normalized_values():
    normalized, error = normalize_store_memory_payload(
        user_query="  hi  ",
        assistant_response="\nhello\t",
        memory_type="  SEMANTIC ",
    )
    assert error is None
    assert normalized == {
        "user_query": "hi",
        "assistant_response": "hello",
        "memory_type": "semantic",
    }


def test_normalize_store_memory_payload_defaults_memory_type():
    normalized, error = normalize_store_memory_payload(
        user_query="hi",
        assistant_response="hello",
        memory_type=None,
    )
    assert error is None
    assert normalized is not None
    assert normalized["memory_type"] == "episodic"


@pytest.mark.parametrize(
    ("query", "memory_type", "expected_error"),
    [
        (None, None, "Query is required for memory search"),
        ("   ", None, "Query is required for memory search"),
        ("hello", 1, "memory_type must be a string"),
        ("hello", "archive", "Invalid memory_type: archive"),
    ],
)
def test_normalize_search_memory_payload_rejects_invalid_inputs(
    query,
    memory_type,
    expected_error,
):
    normalized, error = normalize_search_memory_payload(
        query=query,
        memory_type=memory_type,
    )
    assert normalized is None
    assert error == expected_error


def test_normalize_search_memory_payload_returns_normalized_values():
    normalized, error = normalize_search_memory_payload(
        query="  hello  ",
        memory_type="  SEMANTIC ",
    )
    assert error is None
    assert normalized == {
        "query": "hello",
        "memory_type": "semantic",
    }


def test_normalize_search_memory_payload_allows_no_type_filter():
    normalized, error = normalize_search_memory_payload(
        query="hello",
        memory_type="  ",
    )
    assert error is None
    assert normalized is not None
    assert normalized["query"] == "hello"
    assert normalized["memory_type"] is None


def test_build_store_memory_response_data():
    assert build_store_memory_response_data(
        memory_id="memory-1",
        memory_type="episodic",
    ) == {
        "memory_id": "memory-1",
        "memory_type": "episodic",
        "message": "Stored episodic memory",
    }


class _DummyStore:
    def __init__(self):
        self.calls = []

    async def add(self, content, user_id, metadata, conversation_id=None, **kwargs):
        self.calls.append((content, user_id, metadata, conversation_id, kwargs))
        return "mem-42"


@pytest.mark.asyncio
async def test_store_interaction_memory_formats_and_persists_entry():
    store = _DummyStore()

    memory_id = await store_interaction_memory(
        store,
        user_query="hi",
        assistant_response="hello",
        memory_type="episodic",
        user_id="user-1",
        session_id="session-1",
    )

    assert memory_id == "mem-42"
    assert store.calls == [
        (
            format_interaction_memory("hi", "hello"),
            "user-1",
            build_interaction_metadata("episodic", "session-1"),
            "session-1",
            {"record_kind": "interaction"},
        )
    ]


@pytest.mark.asyncio
async def test_normalize_and_store_interaction_memory_returns_validation_error():
    store = _DummyStore()

    stored, error = await normalize_and_store_interaction_memory(
        store,
        user_query="",
        assistant_response="hello",
        memory_type="episodic",
        user_id="user-1",
        session_id="session-1",
    )

    assert stored is None
    assert error == "Missing user_query or assistant_response"
    assert store.calls == []


@pytest.mark.asyncio
async def test_normalize_and_store_interaction_memory_persists_and_returns_metadata():
    store = _DummyStore()

    stored, error = await normalize_and_store_interaction_memory(
        store,
        user_query="  hi  ",
        assistant_response="\nhello\t",
        memory_type="  SEMANTIC ",
        user_id="user-1",
        session_id="session-1",
    )

    assert error is None
    assert stored == {
        "memory_id": "mem-42",
        "memory_type": "semantic",
    }
    assert store.calls == [
        (
            format_interaction_memory("hi", "hello"),
            "user-1",
            build_interaction_metadata("semantic", "session-1"),
            "session-1",
            {"record_kind": "interaction"},
        )
    ]


@pytest.mark.asyncio
async def test_normalize_and_store_interaction_memory_sanitizes_lone_surrogates():
    store = _DummyStore()

    stored, error = await normalize_and_store_interaction_memory(
        store,
        user_query="hello\udc9duser",
        assistant_response="hello\udc9dassistant",
        memory_type="episodic",
        user_id="user-1",
        session_id="session-1",
    )

    assert error is None
    assert stored == {
        "memory_id": "mem-42",
        "memory_type": "episodic",
    }
    assert store.calls[0][0] == "User: hello�user\nAssistant: hello�assistant"


def test_group_memory_texts_prefers_user_assistant_interactions_for_episodic():
    grouped = group_memory_texts([
        {
            "type": "episodic",
            "text": "single transcript row",
            "metadata": {"record_kind": "transcript"},
        },
        {
            "type": "episodic",
            "text": "User: plan trip\nAssistant: Start with flights",
            "metadata": {"source": "interaction_completed"},
        },
        {
            "type": "semantic",
            "text": "User prefers aisle seats",
        },
    ])

    assert grouped["episodic"] == ["User: plan trip\nAssistant: Start with flights"]
    assert grouped["semantic"] == ["User prefers aisle seats"]


def test_group_memory_texts_falls_back_when_no_interaction_style_episodic_rows():
    grouped = group_memory_texts([
        {"type": "episodic", "text": "recent note"},
        {"type": "semantic", "text": "works in short bursts"},
    ])

    assert grouped["episodic"] == ["recent note"]
    assert grouped["semantic"] == ["works in short bursts"]


def test_group_memory_texts_synthesizes_transcript_user_assistant_pairs():
    grouped = group_memory_texts([
        {
            "type": "episodic",
            "text": "Assistant confirms booking details",
            "record_kind": "transcript",
            "conversation_id": "conv-1",
            "role": "assistant",
            "message_index": 2,
        },
        {
            "type": "episodic",
            "text": "Book me a table for 2",
            "record_kind": "transcript",
            "conversation_id": "conv-1",
            "role": "user",
            "message_index": 1,
        },
        {
            "type": "episodic",
            "text": "Need vegetarian options",
            "record_kind": "transcript",
            "conversation_id": "conv-2",
            "role": "user",
            "message_index": 1,
        },
        {
            "type": "episodic",
            "text": "Assistant shares vegetarian restaurants",
            "record_kind": "transcript",
            "conversation_id": "conv-2",
            "role": "assistant",
            "message_index": 2,
        },
    ])

    assert grouped["episodic"] == [
        "User: Book me a table for 2\nAssistant: Assistant confirms booking details",
        "User: Need vegetarian options\nAssistant: Assistant shares vegetarian restaurants",
    ]


def test_group_memory_texts_transcript_fallback_uses_metadata_fields():
    grouped = group_memory_texts([
        {
            "type": "episodic",
            "text": "Can you summarize yesterday?",
            "metadata": {
                "record_kind": "transcript",
                "conversation_id": "conv-3",
                "role": "user",
                "message_index": 1,
            },
        },
        {
            "type": "episodic",
            "text": "Sure, here is a summary.",
            "metadata": {
                "record_kind": "transcript",
                "conversation_id": "conv-3",
                "role": "assistant",
                "message_index": 2,
            },
        },
    ])

    assert grouped["episodic"] == [
        "User: Can you summarize yesterday?\nAssistant: Sure, here is a summary."
    ]
