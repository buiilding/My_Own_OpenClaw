"""InteractionLoop compaction integration tests."""

from __future__ import annotations

import pytest

from backend.src.agent.compaction.models import CompactionDecision, CompactionResult
from backend.src.agent.execution.interaction_loop import InteractionLoop
from backend.src.core.events.streaming_events import (
    AssistantMessageFullEvent,
    ContextCompactionCompletedEvent,
    ContextCompactionStartedEvent,
    FullResponseEvent,
    StreamingCompleteEvent,
)


class _FakeConfig:
    max_agent_iterations = 4


class _FakeHistory:
    def __init__(self):
        self.assistant_messages = []
        self.staged_tool_call_ids = []

    def add_assistant_message(self, message, tool_calls=None):
        self.assistant_messages.append((message, tool_calls))

    def stage_tool_call_ids(self, tool_call_ids, consume_all_on_next_output=False):
        self.staged_tool_call_ids.append((list(tool_call_ids), consume_all_on_next_output))

    def add_tool_output(self, message, image_data=None):
        _ = (message, image_data)

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
            skip_reason=None,
        )


class _FakeSession:
    def __init__(self):
        self.cfg = _FakeConfig()
        self.history = _FakeHistory()
        self.compaction_engine = _FakeCompactionEngine()
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
                    {"id": "call_1", "name": "read_file", "arguments": {"path": "/tmp/a"}}
                ],
            }
        return {"content": "done"}


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
        _ = error_message
        if False:
            yield None


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

