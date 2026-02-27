import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.operations import normalize_store_memory_payload  # noqa: E402


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
