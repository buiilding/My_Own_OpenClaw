"""InteractionLoop compaction integration tests."""

from __future__ import annotations

import pytest

from backend.src.agent.compaction.models import (
    CompactionDecision,
    CompactionReplacementMessagePreview,
    CompactionResult,
)
from backend.src.agent.execution.interaction_loop import InteractionLoop
from backend.src.core.events.streaming_events import (
    AssistantMessageFullEvent,
    ContextCompactionCompletedEvent,
    ContextCompactionStartedEvent,
    ErrorEvent,
    FullResponseEvent,
    StreamingCompleteEvent,
)


class _FakeConfig:
    pass


class _FakeHistory:
    def __init__(self):
        self.assistant_messages = []
        self.staged_tool_call_ids = []

    def add_assistant_message(self, message, tool_calls=None):
        self.assistant_messages.append((message, tool_calls))

    def stage_tool_call_ids(self, tool_call_ids, consume_all_on_next_output=False):
        self.staged_tool_call_ids.append(
            (list(tool_call_ids), consume_all_on_next_output)
        )

    def add_tool_output(self, message, image_data=None, **kwargs):
        _ = (message, image_data, kwargs)

    def get_stored_messages(self):
        return []


class _FakeCompactionEngine:
    def __init__(self):
        self.evaluate_calls = []
        self.compact_calls = []

    def evaluate(self, *, reason, force=False, pending_user_content=None):
        self.evaluate_calls.append((reason, force, pending_user_content))
        return CompactionDecision(
            should_compact=True,
            reason=reason,
            strategy_name="inline",
            before_tokens=2200,
            projected_tokens=2200,
            user_turn_index=2,
        )

    async def compact(self, *, reason, decision=None):
        self.compact_calls.append((reason, decision))
        return CompactionResult(
            applied=True,
            reason=reason,
            strategy_name="inline",
            before_tokens=2200,
            after_tokens=900,
            removed_messages=7,
            summary_text="summary text",
            replacement_history_preview=[
                CompactionReplacementMessagePreview(
                    role="assistant",
                    message_type="context_compaction",
                    content="[[CONTEXT COMPACTION SUMMARY]]\nsummary text",
                )
            ],
            replacement_history_entries=[
                {
                    "role": "assistant",
                    "content": "[[CONTEXT COMPACTION SUMMARY]]\nsummary text",
                    "message_type": "context_compaction",
                }
            ],
            skip_reason=None,
        )


class _RecoveryCompactionEngine(_FakeCompactionEngine):
    def __init__(self):
        super().__init__()
        self.recovery_used = False

    def evaluate(self, *, reason, force=False, pending_user_content=None):
        self.evaluate_calls.append((reason, force, pending_user_content))
        should_compact = reason == "overflow-retry" and not self.recovery_used
        return CompactionDecision(
            should_compact=should_compact,
            reason=reason,
            strategy_name="inline",
            before_tokens=360000,
            projected_tokens=360000,
            user_turn_index=2,
            skip_reason=None if should_compact else "below-threshold",
        )

    async def compact(self, *, reason, decision=None):
        self.recovery_used = True
        return await super().compact(reason=reason, decision=decision)


class _FakeSession:
    def __init__(self, compaction_engine=None):
        self.cfg = _FakeConfig()
        self.history = _FakeHistory()
        self.compaction_engine = compaction_engine or _FakeCompactionEngine()
        self.session_id = "session-test"


class _FakePromptCoordinator:
    def get_prompt(self, iteration):
        _ = iteration
        return ([{"role": "user", "content": "Do thing"}], [], None)


class _TwoTurnLLMHandler:
    def __init__(self):
        self.calls = 0

    async def get_response(self, prompt, tools=None):
        _ = (prompt, tools)
        self.calls += 1
        if self.calls == 1:
            yield FullResponseEvent(content="")
            return
        yield FullResponseEvent(content="done")

    def get_last_response_payload(self):
        if self.calls == 1:
            return {
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_1",
                        "name": "read_file",
                        "arguments": {"path": "/tmp/a"},
                    }
                ],
            }
        return {"content": "done"}


class _EmptyIncompleteThenRecoveredLLMHandler:
    def __init__(self):
        self.calls = 0

    async def get_response(self, prompt, tools=None):
        _ = (prompt, tools)
        self.calls += 1
        if self.calls == 1:
            yield FullResponseEvent(content="")
            return
        yield FullResponseEvent(content="done after compaction")

    def get_last_response_payload(self):
        if self.calls == 1:
            return {"content": "", "finish_reason": "incomplete"}
        return {"content": "done after compaction"}


class _AlwaysEmptyIncompleteLLMHandler(_EmptyIncompleteThenRecoveredLLMHandler):
    async def get_response(self, prompt, tools=None):
        _ = (prompt, tools)
        self.calls += 1
        yield FullResponseEvent(content="")

    def get_last_response_payload(self):
        return {"content": "", "finish_reason": "incomplete"}


class _ContextOverflowThenRecoveredLLMHandler:
    def __init__(self):
        self.calls = 0

    async def get_response(self, prompt, tools=None):
        _ = (prompt, tools)
        self.calls += 1
        if self.calls == 1:
            yield ErrorEvent(content="context_length_exceeded: maximum context length")
            return
        yield FullResponseEvent(content="done after overflow recovery")

    def get_last_response_payload(self):
        if self.calls == 1:
            return {"content": ""}
        return {"content": "done after overflow recovery"}


class _FakeToolExecutor:
    async def execute(self, parsed_response, session):
        _ = (parsed_response, session)
        if False:
            yield None

    async def process_results(self, parsed_response, session):
        _ = (parsed_response, session)
        return None


class _FakeEventPresenter:
    async def present_prompt_metadata(self, metadata):
        _ = metadata
        if False:
            yield None

    async def present_assistant_message(self, content):
        yield AssistantMessageFullEvent(content=content)

    async def present_completion(self, final_response):
        yield StreamingCompleteEvent(final_response=final_response)

    async def present_error(self, error_message):
        yield ErrorEvent(content=error_message)


@pytest.mark.asyncio
async def test_interaction_loop_runs_mid_turn_compaction_before_second_sampling():
    session = _FakeSession()
    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=_TwoTurnLLMHandler(),
        tool_executor=_FakeToolExecutor(),
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    assert any(isinstance(event, ContextCompactionStartedEvent) for event in events)
    assert any(isinstance(event, ContextCompactionCompletedEvent) for event in events)
    assert any(isinstance(event, StreamingCompleteEvent) for event in events)
    assert session.compaction_engine.evaluate_calls
    assert session.compaction_engine.compact_calls

    completed_event = next(
        event for event in events if isinstance(event, ContextCompactionCompletedEvent)
    )
    assert completed_event.summary_preview == "summary text"
    assert completed_event.replacement_history_entries == [
        {
            "role": "assistant",
            "content": "[[CONTEXT COMPACTION SUMMARY]]\nsummary text",
            "message_type": "context_compaction",
        }
    ]


@pytest.mark.asyncio
async def test_interaction_loop_recovers_empty_incomplete_stream_with_compaction():
    compaction_engine = _RecoveryCompactionEngine()
    session = _FakeSession(compaction_engine=compaction_engine)
    llm_handler = _EmptyIncompleteThenRecoveredLLMHandler()
    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=llm_handler,
        tool_executor=_FakeToolExecutor(),
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    assert llm_handler.calls == 2
    assert ("overflow-retry", False, None) in compaction_engine.evaluate_calls
    completed_event = next(
        event
        for event in events
        if isinstance(event, ContextCompactionCompletedEvent)
        and event.reason == "overflow-retry"
    )
    assert completed_event.summary_text == "summary text"
    assert any(
        isinstance(event, StreamingCompleteEvent)
        and event.final_response == "done after compaction"
        for event in events
    )


@pytest.mark.asyncio
async def test_interaction_loop_recovers_context_overflow_error_with_forced_compaction():
    compaction_engine = _RecoveryCompactionEngine()
    session = _FakeSession(compaction_engine=compaction_engine)
    llm_handler = _ContextOverflowThenRecoveredLLMHandler()
    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=llm_handler,
        tool_executor=_FakeToolExecutor(),
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    assert llm_handler.calls == 2
    assert ("overflow-retry", True, None) in compaction_engine.evaluate_calls
    assert any(
        isinstance(event, ContextCompactionCompletedEvent)
        and event.reason == "overflow-retry"
        for event in events
    )
    assert any(
        isinstance(event, StreamingCompleteEvent)
        and event.final_response == "done after overflow recovery"
        for event in events
    )


@pytest.mark.asyncio
async def test_interaction_loop_stops_empty_incomplete_recovery_after_one_retry():
    compaction_engine = _RecoveryCompactionEngine()
    session = _FakeSession(compaction_engine=compaction_engine)
    llm_handler = _AlwaysEmptyIncompleteLLMHandler()
    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=llm_handler,
        tool_executor=_FakeToolExecutor(),
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    assert llm_handler.calls == 2
    assert len(compaction_engine.compact_calls) == 1
    error_events = [event for event in events if isinstance(event, ErrorEvent)]
    assert len(error_events) == 1
    assert "still failed after compacting history" in error_events[0].content
    assert not any(isinstance(event, StreamingCompleteEvent) for event in events)
