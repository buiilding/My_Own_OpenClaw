from backend.src.services.vm_run_control_support.vm_run_control_bulk_stop import (
    stop_active_runs,
)


def test_stop_active_runs_filters_workspace_and_status_and_invokes_callback() -> None:
    runs = {
        "run-1": {"run_id": "run-1", "workspace_id": "ws-1", "status": "running"},
        "run-2": {"run_id": "run-2", "workspace_id": "ws-2", "status": "paused"},
        "run-3": {"run_id": "run-3", "workspace_id": "ws-1", "status": "completed"},
    }
    stopped_run_ids = []

    def on_stop(run):
        stopped_run_ids.append(run["run_id"])

    result = stop_active_runs(
        runs,
        workspace_id="ws-1",
        active_statuses=frozenset({"awaiting_worker", "queued", "running", "paused"}),
        on_stop=on_stop,
    )

    assert result == ["run-1"]
    assert stopped_run_ids == ["run-1"]
    assert runs["run-1"]["status"] == "stopped"
    assert runs["run-2"]["status"] == "paused"
    assert runs["run-3"]["status"] == "completed"


def test_stop_active_runs_stops_all_workspaces_when_workspace_id_not_provided() -> None:
    runs = {
        "run-1": {"run_id": "run-1", "workspace_id": "ws-1", "status": "awaiting_worker"},
        "run-2": {"run_id": "run-2", "workspace_id": "ws-2", "status": "paused"},
    }
    callbacks = []

    result = stop_active_runs(
        runs,
        workspace_id=None,
        active_statuses=frozenset({"awaiting_worker", "queued", "running", "paused"}),
        on_stop=lambda run: callbacks.append(run["run_id"]),
    )

    assert result == ["run-1", "run-2"]
    assert callbacks == ["run-1", "run-2"]
    assert runs["run-1"]["status"] == "stopped"
    assert runs["run-2"]["status"] == "stopped"

