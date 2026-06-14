"""Covers vm run control pending controls behavior in the backend test suite."""

from backend.src.services.vm_run_control_support.vm_run_control_pending_controls import (
    collect_pending_control_commands_for_worker,
    create_control_command,
)


def test_create_control_command_keeps_expected_fields() -> None:
    command = create_control_command(
        command_id="cmd-1",
        action="pause",
        requested_by="tester",
        control_mode="shared_control",
        created_at="2026-03-05T00:00:00+00:00",
    )
    assert command == {
        "command_id": "cmd-1",
        "action": "pause",
        "requested_by": "tester",
        "control_mode": "shared_control",
        "created_at": "2026-03-05T00:00:00+00:00",
    }


def test_collect_pending_control_commands_for_worker_drains_matching_runs() -> None:
    runs = {
        "run-1": {
            "run_id": "run-1",
            "worker": {"worker_id": "worker-a"},
            "pending_controls": [{"command_id": "c1", "action": "pause"}],
        },
        "run-2": {
            "run_id": "run-2",
            "worker": {"worker_id": "worker-a"},
            "pending_controls": [{"command_id": "c2", "action": "resume"}],
        },
        "run-3": {
            "run_id": "run-3",
            "worker": {"worker_id": "worker-b"},
            "pending_controls": [{"command_id": "c3", "action": "stop"}],
        },
    }

    commands = collect_pending_control_commands_for_worker(runs, worker_id="worker-a")

    assert commands == [
        {"run_id": "run-1", "command_id": "c1", "action": "pause"},
        {"run_id": "run-2", "command_id": "c2", "action": "resume"},
    ]
    assert runs["run-1"]["pending_controls"] == []
    assert runs["run-2"]["pending_controls"] == []
    assert runs["run-3"]["pending_controls"] == [{"command_id": "c3", "action": "stop"}]
