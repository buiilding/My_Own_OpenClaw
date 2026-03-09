from backend.src.api.services.rehydrate_tool_linkage_repair import (
    RehydrateToolLinkageState,
)


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


def test_build_missing_tool_output_entries_clears_pending_ids():
    state = RehydrateToolLinkageState(
        known_tool_call_ids={"call-1"},
        pending_tool_call_ids=["call-1"],
    )

    repaired_entries = state.build_missing_tool_output_entries(
        timestamp="2026-03-09T12:00:00Z",
    )

    assert repaired_entries == [
        {
            "role": "tool",
            "content": (
                "Tool execution transcript missing during rehydrate. "
                "Treating the pending tool call as unresolved."
            ),
            "message_type": "tool-output",
            "tool_name": None,
            "correlation_id": "call-1",
            "timestamp": "2026-03-09T12:00:00Z",
            "image_data": None,
            "tool_call_id": "call-1",
        }
    ]
    assert state.pending_tool_call_ids == []
