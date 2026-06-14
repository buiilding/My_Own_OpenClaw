"""Covers session registry behavior in the backend test suite."""

from backend.src.agent.session.session_registry import SessionRegistry


class _DummySession:
    pass


def test_session_registry_tracks_named_and_default_conversation_resolution():
    registry = SessionRegistry()
    default_session = _DummySession()
    named_session = _DummySession()

    registry.store_session("user-1", default_session, conversation_ref=None)
    registry.store_session("user-1", named_session, conversation_ref="conv-a")

    assert registry.get_session("user-1", conversation_ref=None) is named_session
    assert registry.get_session("user-1", conversation_ref="conv-a") is named_session
    assert registry.resolve_default_conversation_ref("user-1") == "conv-a"


def test_session_registry_remove_session_updates_fallback_reference():
    registry = SessionRegistry()
    first = _DummySession()
    second = _DummySession()

    registry.store_session("user-1", first, conversation_ref="conv-a")
    registry.store_session("user-1", second, conversation_ref="conv-b")
    removed = registry.remove_session("user-1", "conv-b")

    assert removed is second
    assert registry.get_session("user-1") is first
    assert registry.resolve_default_conversation_ref("user-1") == "conv-a"
