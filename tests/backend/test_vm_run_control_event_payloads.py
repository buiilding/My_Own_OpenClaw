from backend.src.services.vm_run_control_event_payloads import (
    build_run_control_payload,
    build_run_created_payload,
    build_run_dispatched_payload,
    build_worker_assigned_payload,
)


def test_build_run_created_payload_contains_expected_fields() -> None:
    payload = build_run_created_payload(
        run_id="run-1",
        workspace_id="ws-1",
        agent_id="agent-1",
        conversation_ref="conv-1",
        status="awaiting_worker",
        control_mode="agent_only",
    )
    assert payload["run_id"] == "run-1"
    assert payload["workspace_id"] == "ws-1"
    assert payload["control_mode"] == "agent_only"


def test_build_worker_assigned_payload_contains_worker_identity() -> None:
    payload = build_worker_assigned_payload(
        worker_id="worker-1",
        user_id="user-1",
        vm_id="vm-1",
        session_id="session-1",
        agent_id="agent-1",
        status="queued",
    )
    assert payload == {
        "worker_id": "worker-1",
        "user_id": "user-1",
        "vm_id": "vm-1",
        "session_id": "session-1",
        "agent_id": "agent-1",
        "status": "queued",
    }


def test_build_run_control_payload_sets_bulk_only_when_requested() -> None:
    payload = build_run_control_payload(
        action="stop",
        requested_by="tester",
        control_mode="agent_only",
        status="stopped",
        command_id="cmd-1",
        bulk=False,
    )
    assert "bulk" not in payload

    bulk_payload = build_run_control_payload(
        action="stop",
        requested_by="tester",
        control_mode="agent_only",
        status="stopped",
        command_id="cmd-2",
        bulk=True,
    )
    assert bulk_payload["bulk"] is True


def test_build_run_dispatched_payload_preserves_turn_and_conversation() -> None:
    payload = build_run_dispatched_payload(
        worker_id="worker-9",
        user_id="user-9",
        turn_ref="turn-9",
        conversation_ref="conv-9",
    )
    assert payload["turn_ref"] == "turn-9"
    assert payload["conversation_ref"] == "conv-9"
