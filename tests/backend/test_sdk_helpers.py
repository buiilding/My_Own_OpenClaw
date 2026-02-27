import pytest

from backend.src.core.config.models import AppConfig
from backend.src.sdk.agents.config_helper import override_model_id
from backend.src.sdk.agents.response_extractor import extract_response


class _FakeHistory:
    def __init__(self, rows):
        self._rows = list(rows)

    def get_history(self):
        return list(self._rows)


class _FakeSession:
    def __init__(self, events, history_rows):
        self._events = list(events)
        self.history = _FakeHistory(history_rows)

    async def process_query(self, _query, image_data=None):  # noqa: ARG002
        for event in self._events:
            yield event


@pytest.mark.asyncio
async def test_extract_response_uses_stream_chunks_and_collects_tool_calls():
    session = _FakeSession(
        events=[
            {"type": "tool_call", "tool_name": "read_file", "parameters": {"file_path": "/tmp/a"}},
            {"type": "chunk", "content": "Hello"},
            {"type": "chunk", "content": " world"},
            {"type": "streaming-complete"},
        ],
        history_rows=[],
    )

    response, tool_calls = await extract_response(session, "q", collect_tool_calls=True)

    assert response == "Hello world"
    assert tool_calls == [{"tool": "read_file", "parameters": {"file_path": "/tmp/a"}}]


@pytest.mark.asyncio
async def test_extract_response_returns_error_message_when_error_event_received():
    session = _FakeSession(
        events=[{"type": "error", "content": "boom"}],
        history_rows=[],
    )

    assert await extract_response(session, "q") == "Error: boom"


@pytest.mark.asyncio
async def test_extract_response_falls_back_to_assistant_history_multimodal_text():
    session = _FakeSession(
        events=[],
        history_rows=[
            {"role": "user", "content": "hi"},
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Part A"},
                    {"type": "image_url", "image_url": {"url": "https://example.com/a.png"}},
                    {"type": "text", "text": " + Part B"},
                ],
            },
        ],
    )

    assert await extract_response(session, "q") == "Part A + Part B"


@pytest.mark.asyncio
async def test_extract_response_returns_default_when_no_events_or_assistant_text():
    session = _FakeSession(events=[], history_rows=[{"role": "user", "content": "only user"}])

    assert await extract_response(session, "q") == "Agent finished without a response."


def test_override_model_id_returns_new_config_without_mutating_original():
    original = AppConfig(selected_model_id="gpt-5.1", model_provider="openai")

    updated = override_model_id(original, "k2p5")

    assert updated.selected_model_id == "k2p5"
    assert original.selected_model_id == "gpt-5.1"
    assert updated.model_provider == original.model_provider
