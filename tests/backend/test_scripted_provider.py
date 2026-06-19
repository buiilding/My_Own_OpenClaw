"""Covers deterministic scripted provider behavior."""

import pytest

from backend.src.core.events.streaming_events import ChunkEvent
from backend.src.llm.providers.scripted import ScriptedProvider


async def _collect_stream(provider: ScriptedProvider, messages):
    events = []
    async for event in provider.get_completion_stream(
        model="scripted-runtime",
        messages=messages,
        tools=[{"type": "function", "name": "read_file"}],
    ):
        events.append(event)
    return events


def _user_message(content):
    return {"role": "user", "content": content}


@pytest.mark.asyncio
async def test_scripted_reply_streams_chunks_and_captures_payload():
    provider = ScriptedProvider()

    events = await _collect_stream(
        provider,
        [
            _user_message(
                "<user_query>@script reply Hello from scripted model</user_query>"
            )
        ],
    )

    assert (
        "".join(event.content for event in events if isinstance(event, ChunkEvent))
        == "Hello from scripted model"
    )
    assert provider.get_last_stream_response_payload() == {
        "content": "Hello from scripted model",
        "finish_reason": "stop",
    }


@pytest.mark.asyncio
async def test_scripted_tool_alias_normalizes_to_real_tool_schema():
    provider = ScriptedProvider()

    await _collect_stream(
        provider,
        [_user_message('@script tool filesystem_read {"path":"README.md"}')],
    )

    assert provider.get_last_stream_response_payload() == {
        "content": "Scripted runtime queued 1 tool call(s): read_file.",
        "tool_calls": [
            {
                "id": "scripted_call_1",
                "name": "read_file",
                "arguments": {
                    "file_path": "README.md",
                    "explanation": "Validate the scripted model tool path.",
                },
            }
        ],
        "finish_reason": "tool_calls",
    }


@pytest.mark.asyncio
async def test_scripted_batch_emits_multiple_tool_calls():
    provider = ScriptedProvider()

    await _collect_stream(
        provider,
        [
            _user_message(
                "@script batch ["
                '{"tool":"screenshot","args":{}},'
                '{"tool":"filesystem_read","args":{"path":"README.md"}}'
                "]"
            )
        ],
    )

    payload = provider.get_last_stream_response_payload()
    assert payload is not None
    assert payload["content"] == (
        "Scripted runtime queued 2 tool call(s): screenshot, read_file."
    )
    assert payload["finish_reason"] == "tool_calls"
    assert payload["tool_calls"][0] == {
        "id": "scripted_call_1",
        "name": "screenshot",
        "arguments": {
            "explanation": "Validate the scripted model tool path.",
        },
    }
    assert payload["tool_calls"][1]["name"] == "read_file"
    assert payload["tool_calls"][1]["arguments"]["file_path"] == "README.md"


@pytest.mark.asyncio
async def test_scripted_image_command_reports_provider_prompt_image_parts():
    provider = ScriptedProvider()

    events = await _collect_stream(
        provider,
        [
            _user_message(
                [
                    {"type": "text", "text": "@script image?"},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,a"},
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,b"},
                    },
                ]
            )
        ],
    )

    assert "".join(
        event.content for event in events if isinstance(event, ChunkEvent)
    ) == (
        "Scripted runtime received 2 image(s) in the provider prompt. "
        "parsed_to_model=true."
    )


@pytest.mark.asyncio
async def test_scripted_tool_reports_invalid_json_as_streamed_text():
    provider = ScriptedProvider()

    events = await _collect_stream(
        provider,
        [_user_message('@script tool filesystem_read {"path":')],
    )

    assert (
        "".join(event.content for event in events if isinstance(event, ChunkEvent))
        == "Scripted command error: invalid JSON arguments: Expecting value"
    )
    assert provider.get_last_stream_response_payload() == {
        "content": "Scripted command error: invalid JSON arguments: Expecting value",
        "finish_reason": "stop",
    }
