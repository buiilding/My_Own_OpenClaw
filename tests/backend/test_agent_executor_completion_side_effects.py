"""Covers agent executor completion side effects behavior in the backend test suite."""

from types import SimpleNamespace

import pytest

from backend.src.agent.execution.executor import AgentExecutor
from backend.src.core.events.bus_events import InteractionCompleted
from backend.src.core.events.streaming_events import StreamingCompleteEvent


class _History:
    def __init__(self):
        self.history = []
        self.added_messages = []

    def add_user_message(self, **kwargs):
        self.added_messages.append(kwargs)
        self.history.append(kwargs)


class _PromptBuilder:
    def format_user_message_content(self, *, message_content, is_first_message):
        assert is_first_message is True
        return message_content


class _ScreenshotManager:
    async def process_screenshot(self, *_args, **_kwargs):
        raise AssertionError("screenshot processing should not run in this regression")


class _InteractionLoop:
    async def run_loop(self):
        yield StreamingCompleteEvent(final_response="assistant done")


class _EventBus:
    def __init__(self):
        self.published = []

    async def publish(self, event):
        self.published.append(event)


@pytest.mark.asyncio
async def test_process_query_publishes_interaction_completed_without_memory_event():
    executor = AgentExecutor.__new__(AgentExecutor)
    history = _History()
    event_bus = _EventBus()
    background_tasks = []

    executor.session = SimpleNamespace(
        user_id="user-1",
        session_id="session-1",
        history=history,
        runtime=SimpleNamespace(active_conversation_ref="conv-1"),
        register_background_task=background_tasks.append,
    )
    executor.prompt_builder = _PromptBuilder()
    executor.screenshot_manager = _ScreenshotManager()
    executor.interaction_loop = _InteractionLoop()
    executor.event_bus = event_bus

    events = [
        event
        async for event in executor.process_query(
            "hello",
            message_content="<user_query>hello</user_query>",
        )
    ]

    assert history.added_messages[0]["user_query_raw"] == "hello"
    assert len(events) == 1
    assert isinstance(events[0], StreamingCompleteEvent)
    assert len(event_bus.published) == 1
    assert isinstance(event_bus.published[0], InteractionCompleted)
    assert event_bus.published[0].assistant_response == "assistant done"
    assert background_tasks == []
