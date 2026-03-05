from backend.src.services.vm_run_control_support.vm_run_control_transitions import (
    apply_control_transition,
    apply_stream_event_transition,
    apply_worker_heartbeat_transition,
    normalize_control_action,
)


def test_normalize_control_action_trims_and_lowercases() -> None:
    assert normalize_control_action("  SeT-CoNtRoL-MoDe  ") == "set-control-mode"


def test_apply_control_transition_updates_status_and_control_mode() -> None:
    run = {"status": "awaiting_worker", "control_mode": "agent_only", "worker": None}
    apply_control_transition(run, action="pause", control_mode=None)
    assert run["status"] == "paused"

    apply_control_transition(run, action="resume", control_mode=None)
    assert run["status"] == "awaiting_worker"

    run["worker"] = {"worker_id": "w1"}
    apply_control_transition(run, action="resume", control_mode=None)
    assert run["status"] == "running"

    apply_control_transition(run, action="set-control-mode", control_mode="shared_control")
    assert run["control_mode"] == "shared_control"


def test_apply_stream_event_transition_applies_terminal_and_running_promotion() -> None:
    run = {"status": "queued"}
    apply_stream_event_transition(
        run,
        event_type="streaming-response",
        terminal_event_to_status={"streaming-complete": "completed", "error": "failed"},
    )
    assert run["status"] == "running"

    apply_stream_event_transition(
        run,
        event_type="error",
        terminal_event_to_status={"streaming-complete": "completed", "error": "failed"},
    )
    assert run["status"] == "failed"


def test_apply_worker_heartbeat_transition_promotes_only_when_ready() -> None:
    run = {"status": "queued"}
    apply_worker_heartbeat_transition(run, status="initializing", ready_worker_statuses={"ready", "running"})
    assert run["status"] == "queued"

    apply_worker_heartbeat_transition(run, status="ready", ready_worker_statuses={"ready", "running"})
    assert run["status"] == "running"
