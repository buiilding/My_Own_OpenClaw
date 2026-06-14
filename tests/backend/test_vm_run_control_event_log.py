"""Covers vm run control event log behavior in the backend test suite."""

from backend.src.services.vm_run_control_support.vm_run_control_event_log import append_run_event, select_run_events


def _build_run_state() -> dict:
    return {
        "run_id": "run-1",
        "last_event_seq": 0,
        "updated_at": "2026-01-01T00:00:00Z",
        "events": [],
    }


def test_append_run_event_increments_sequence_and_copies_payload() -> None:
    run = _build_run_state()
    payload = {"value": {"nested": 1}}

    event = append_run_event(
        run,
        event_type="run-created",
        source="api",
        payload=payload,
    )

    payload["value"]["nested"] = 9

    assert event["seq"] == 1
    assert run["last_event_seq"] == 1
    assert run["events"][0]["payload"]["value"]["nested"] == 1
    assert run["updated_at"] == event["timestamp"]


def test_select_run_events_filters_and_bounds() -> None:
    run = _build_run_state()
    for idx in range(5):
        append_run_event(
            run,
            event_type=f"event-{idx}",
            source="api",
            payload={"idx": idx},
        )

    events = select_run_events(run, after_seq=2, limit=2)
    assert [event["seq"] for event in events] == [3, 4]

    # Returned events are deep-copied.
    events[0]["payload"]["idx"] = 999
    assert run["events"][2]["payload"]["idx"] == 2
