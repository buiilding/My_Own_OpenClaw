"""Shared helper logic for `/api/runs` route handlers."""

from __future__ import annotations

from fastapi import HTTPException

from .models import RunControlRequest, RunEvent, RunEventsResponse


def validate_control_request(payload: RunControlRequest) -> None:
    if payload.action == "set-control-mode" and payload.control_mode is None:
        raise HTTPException(
            status_code=422,
            detail="control_mode is required when action is set-control-mode",
        )


def build_run_events_response(
    run_id: str,
    events: list[dict],
    after_seq: int,
) -> RunEventsResponse:
    next_after_seq = after_seq
    if events:
        next_after_seq = int(events[-1]["seq"])
    return RunEventsResponse(
        run_id=run_id,
        events=[RunEvent(**event) for event in events],
        next_after_seq=next_after_seq,
    )

