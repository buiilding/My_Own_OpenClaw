"""Covers rehydrate tool linkage behavior in the backend test suite."""

from backend.src.api.services.rehydrate_tool_linkage import RehydrateToolLinkageState


def test_register_tool_call_ids_tracks_known_and_pending_once():
    state = RehydrateToolLinkageState()

    state.register_tool_call_ids(["call-1", "call-2", "call-1", ""])

    assert state.known_tool_call_ids == {"call-1", "call-2"}
    assert state.pending_tool_call_ids == ["call-1", "call-2"]


def test_consume_tool_output_tool_call_id_prefers_explicit_match():
    state = RehydrateToolLinkageState(
        known_tool_call_ids={"call-1", "call-2"},
        pending_tool_call_ids=["call-1", "call-2"],
    )

    assert state.consume_tool_output_tool_call_id("call-2") == "call-2"
    assert state.pending_tool_call_ids == ["call-1"]


def test_require_no_pending_tool_calls_rejects_unanswered_ids():
    state = RehydrateToolLinkageState(
        known_tool_call_ids={"call-1"},
        pending_tool_call_ids=["call-1"],
    )

    try:
        state.require_no_pending_tool_calls()
    except ValueError as exc:
        assert "unanswered tool calls: call-1" in str(exc)
    else:
        raise AssertionError("expected pending tool call validation to fail")

    assert state.pending_tool_call_ids == ["call-1"]


def test_require_no_pending_tool_calls_accepts_complete_linkage():
    state = RehydrateToolLinkageState(
        known_tool_call_ids={"call-1"},
        pending_tool_call_ids=[],
    )

    state.require_no_pending_tool_calls()
