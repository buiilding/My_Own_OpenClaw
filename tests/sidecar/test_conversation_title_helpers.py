import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.conversation_title_helpers import ensure_conversation_title  # noqa: E402
from memory.conversation_title_helpers import ensure_conversation_title_from_row  # noqa: E402
from memory.conversation_title_helpers import fetch_pending_title_input  # noqa: E402
from memory.conversation_title_helpers import fetch_title_generation_inputs  # noqa: E402
from memory.conversation_title_helpers import lookup_conversation_title_state  # noqa: E402
from memory.conversation_title_helpers import normalize_generated_title  # noqa: E402
from memory.conversation_titles import derive_pending_conversation_title  # noqa: E402


class _QueueCursor:
    def __init__(self, fetch_results):
        self.fetch_results = list(fetch_results)
        self.executed = []

    async def execute(self, query, params):
        self.executed.append((query, params))

    async def fetchone(self):
        if not self.fetch_results:
            return None
        return self.fetch_results.pop(0)


class _Row(dict):
    pass


def test_normalize_generated_title_strips_prefix_and_limits_words():
    title = normalize_generated_title(
        'Title:   "A very long title with too many words and punctuation!!!"\nextra line'
    )
    assert title == "A very long title with too"


def test_derive_pending_conversation_title_keeps_user_prompt_text():
    title = derive_pending_conversation_title("How to fix ubuntu mic settings")
    assert title == "How to fix ubuntu mic settings"


@pytest.mark.asyncio
async def test_lookup_conversation_title_state_handles_row_and_missing():
    row_cursor = _QueueCursor([_Row(title="Saved title", source="model", is_locked=1)])
    title, source, is_locked = await lookup_conversation_title_state(
        cursor=row_cursor,
        user_id="user-1",
        conversation_id="conv_1",
    )
    assert title == "Saved title"
    assert source == "model"
    assert is_locked is True

    empty_cursor = _QueueCursor([None])
    title, source, is_locked = await lookup_conversation_title_state(
        cursor=empty_cursor,
        user_id="user-1",
        conversation_id="conv_2",
    )
    assert title is None
    assert source is None
    assert is_locked is False


@pytest.mark.asyncio
async def test_fetch_title_generation_inputs_falls_back_when_preferred_model_missing():
    cursor = _QueueCursor(
        [
            _Row(content="user question"),
            None,
            _Row(content="assistant answer", model_id="gpt-4o", model_provider="openai"),
        ]
    )

    user_content, assistant_content, model_id, model_provider = await fetch_title_generation_inputs(
        cursor=cursor,
        user_id="user-1",
        conversation_id="conv_1",
        preferred_model_id="missing-model",
        preferred_model_provider="missing-provider",
    )

    assert user_content == "user question"
    assert assistant_content == "assistant answer"
    assert model_id == "gpt-4o"
    assert model_provider == "openai"
    assert len(cursor.executed) == 3


@pytest.mark.asyncio
async def test_fetch_pending_title_input_reads_first_user_row():
    cursor = _QueueCursor([_Row(content="First user message title")])

    title_input = await fetch_pending_title_input(
        cursor=cursor,
        user_id="user-1",
        conversation_id="conv_1",
    )

    assert title_input == "First user message title"
    assert len(cursor.executed) == 1


@pytest.mark.asyncio
async def test_ensure_conversation_title_prefers_existing_title_without_lookup():
    cursor = _QueueCursor([])

    title, source = await ensure_conversation_title(
        cursor=cursor,
        user_id="user-1",
        conversation_id="conv_1",
        existing_title="  Existing title  ",
        existing_title_source="manual",
        existing_title_locked=0,
    )

    assert title == "Existing title"
    assert source == "manual"
    assert cursor.executed == []


@pytest.mark.asyncio
async def test_ensure_conversation_title_from_row_reads_row_shape():
    cursor = _QueueCursor([])
    title, source = await ensure_conversation_title_from_row(
        cursor=cursor,
        user_id="user-1",
        row={
            "conversation_id": "conv_1",
            "title": "  Row title  ",
            "title_source": None,
            "title_locked": 0,
        },
    )

    assert title == "Row title"
    assert source == "model"


@pytest.mark.asyncio
async def test_ensure_conversation_title_from_row_uses_first_user_content_when_saved_title_missing():
    cursor = _QueueCursor([None])
    title, source = await ensure_conversation_title_from_row(
        cursor=cursor,
        user_id="user-1",
        row={
            "conversation_id": "conv_1",
            "title": None,
            "title_source": None,
            "title_locked": 0,
            "first_user_content": "How to fix ubuntu mic settings",
        },
    )

    assert title == "How to fix ubuntu mic settings"
    assert source == "heuristic"
