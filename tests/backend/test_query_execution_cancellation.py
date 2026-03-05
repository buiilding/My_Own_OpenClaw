from types import SimpleNamespace

from backend.src.api.services.query_execution_support.query_execution_cancellation import (
    finalize_pending_tool_calls_on_cancel,
)


def test_finalize_pending_tool_calls_on_cancel_handles_success_failure_and_noop():
    class _HistoryOk:
        def __init__(self):
            self.calls = 0

        def finalize_pending_tool_calls_as_cancelled(self):
            self.calls += 1
            return "2"

    class _HistoryErr:
        def finalize_pending_tool_calls_as_cancelled(self):
            raise RuntimeError("boom")

    agent_ok = SimpleNamespace(history=_HistoryOk(), user_id="u", session_id="s")
    finalize_pending_tool_calls_on_cancel(
        agent_instance=agent_ok,
        msg_id="turn-1",
        conversation_ref="conv-1",
    )
    assert agent_ok.history.calls == 1

    agent_err = SimpleNamespace(history=_HistoryErr(), user_id="u", session_id="s")
    finalize_pending_tool_calls_on_cancel(
        agent_instance=agent_err,
        msg_id="turn-2",
        conversation_ref="conv-2",
    )

    agent_noop = SimpleNamespace(history=SimpleNamespace(), user_id="u", session_id="s")
    finalize_pending_tool_calls_on_cancel(
        agent_instance=agent_noop,
        msg_id="turn-3",
        conversation_ref="conv-3",
    )
