import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.operations import (  # noqa: E402
    normalize_search_memory_payload,
    normalize_store_memory_payload,
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
