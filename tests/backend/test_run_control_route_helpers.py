"""Covers run control route helpers behavior in the backend test suite."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from backend.src.api.routes.runs.models import RunControlRequest
from backend.src.api.routes.runs.route_helpers import (
    build_run_events_response,
    validate_control_request,
)


def test_validate_control_request_requires_control_mode_for_set_control_mode() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_control_request(RunControlRequest(action="set-control-mode"))

    assert exc_info.value.status_code == 422
    assert "control_mode is required" in str(exc_info.value.detail)


def test_validate_control_request_accepts_non_control_mode_actions() -> None:
    validate_control_request(RunControlRequest(action="pause"))


def test_build_run_events_response_uses_after_seq_when_no_events() -> None:
    response = build_run_events_response("run-1", [], after_seq=7)

    assert response.run_id == "run-1"
    assert response.events == []
    assert response.next_after_seq == 7


def test_build_run_events_response_advances_next_after_seq() -> None:
    response = build_run_events_response(
        "run-1",
        [
            {"seq": 2, "timestamp": "2026-03-06T00:00:00Z", "event_type": "a", "source": "api", "payload": {}},
            {"seq": 3, "timestamp": "2026-03-06T00:00:01Z", "event_type": "b", "source": "api", "payload": {}},
        ],
        after_seq=1,
    )

    assert len(response.events) == 2
    assert response.events[1].seq == 3
    assert response.next_after_seq == 3
