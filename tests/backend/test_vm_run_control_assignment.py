from backend.src.services.vm_run_control_support.vm_run_control_assignment import assign_next_run_to_worker


def test_assign_next_run_to_worker_skips_when_worker_not_ready() -> None:
    assigned = assign_next_run_to_worker(
        runs={},
        workers={},
        workspace_queue=[],
        worker_id="w-1",
        user_id="u-1",
        vm_id="vm-1",
        session_id=None,
        agent_id=None,
        worker_status="offline",
        ready_worker_statuses=frozenset({"ready"}),
        now_iso=lambda: "2026-01-01T00:00:00Z",
        append_event=lambda *_args, **_kwargs: {},
        clone_run=lambda run: dict(run),
    )
    assert assigned is None


def test_assign_next_run_to_worker_assigns_eligible_run() -> None:
    run = {
        "run_id": "run-1",
        "status": "awaiting_worker",
        "worker": None,
        "events": [],
        "last_event_seq": 0,
    }
    runs = {"run-1": run}
    queue = ["run-1"]
    workers = {"worker-1": {"metadata": {"source": "heartbeat"}}}
    observed_events: list[dict] = []

    def _append_event(run_state, **kwargs):
        run_state.setdefault("events", []).append(kwargs)
        observed_events.append(kwargs)
        return kwargs

    assigned = assign_next_run_to_worker(
        runs=runs,
        workers=workers,
        workspace_queue=queue,
        worker_id="worker-1",
        user_id="user-1",
        vm_id="vm-1",
        session_id="session-1",
        agent_id="agent-1",
        worker_status="ready",
        ready_worker_statuses=frozenset({"ready", "running"}),
        now_iso=lambda: "2026-01-01T00:00:00Z",
        append_event=_append_event,
        clone_run=lambda run_state: dict(run_state),
    )

    assert assigned is not None
    assert assigned["status"] == "queued"
    assert assigned["worker"]["worker_id"] == "worker-1"
    assert run["worker"]["metadata"] == {"source": "heartbeat"}
    assert queue == []
    assert observed_events[0]["event_type"] == "run-worker-assigned"
