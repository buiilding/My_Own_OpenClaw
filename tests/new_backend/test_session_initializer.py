from types import SimpleNamespace

import pytest

from backend.src.agent.session.initializer import (
    init_event_bus,
    init_identity,
    init_session_state,
)


def test_init_identity_sets_session_id():
    session = SimpleNamespace()
    init_identity(session, "user", None)

    assert session.user_id == "user"
    assert session.session_id


def test_init_session_state_sets_fields():
    session = SimpleNamespace()
    init_session_state(session)

    assert session._screenshot_state is not None
    assert session._resolved_tool_call_storage is not None
    assert session._tool_result_futures == {}
    assert session.ocr_completion_event.is_set()


def test_init_event_bus_requires_bus():
    session = SimpleNamespace()
    with pytest.raises(ValueError):
        init_event_bus(session, None)
