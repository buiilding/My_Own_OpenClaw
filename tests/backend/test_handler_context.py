"""Tests for shared websocket handler context helpers."""

from backend.src.api.handlers.context import build_user_session_context


class _SessionWithRuntime:
    session_id = "session_test"

    class runtime:  # noqa: N801 - test helper mimics runtime shape
        active_conversation_ref = "conv_test"


def test_build_user_session_context_includes_session_and_conversation():
    context = build_user_session_context(
        user_id="user_1",
        session=_SessionWithRuntime(),
    )

    assert context == {
        "user_id": "user_1",
        "session_id": "session_test",
        "conversation_ref": "conv_test",
    }


def test_build_user_session_context_handles_missing_session():
    context = build_user_session_context(user_id="user_1", session=None)

    assert context == {"user_id": "user_1"}
