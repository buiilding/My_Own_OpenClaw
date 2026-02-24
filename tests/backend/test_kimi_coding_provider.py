"""Tests for KimiCodingProvider streaming thinking + tool-call aggregation."""

import pytest

from backend.src.core.events.streaming_events import ChunkEvent, ThinkingEvent
from backend.src.llm.providers.kimi_coding import KimiCodingProvider


def test_kimi_provider_supports_streaming_tool_turns():
    provider = KimiCodingProvider(api_key="test-key")
    assert provider.supports_streaming_tool_turns("k2p5") is True


@pytest.mark.asyncio
async def test_kimi_completion_uses_anthropic_custom_provider(monkeypatch):
    provider = KimiCodingProvider(api_key="test-key")
    captured_kwargs = {}

    async def fake_acompletion(**kwargs):
        captured_kwargs.update(kwargs)
        return {
            "choices": [
                {
                    "message": {"content": "ok"},
                }
            ]
        }

    monkeypatch.setattr("backend.src.llm.providers.base.litellm.acompletion", fake_acompletion)

    result = await provider.get_completion(
        model="k2p5",
        messages=[{"role": "user", "content": "hi"}],
    )

    assert captured_kwargs["custom_llm_provider"] == "anthropic"
    assert result["content"] == "ok"


@pytest.mark.asyncio
async def test_kimi_stream_emits_thinking_and_captures_stream_tool_calls(monkeypatch):
    provider = KimiCodingProvider(api_key="test-key")

    async def fake_stream():
        yield {
            "choices": [
                {
                    "delta": {
                        "reasoning_content": "step-1",
                        "content": "Hello ",
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_1",
                                "function": {
                                    "name": "read_file",
                                    "arguments": "{\"path\":\"/tmp",
                                },
                            }
                        ],
                    }
                }
            ]
        }
        yield {
            "choices": [
                {
                    "delta": {
                        "content": "world",
                        "tool_calls": [
                            {
                                "index": 0,
                                "function": {"arguments": "/demo.txt\"}"},
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ]
        }

    async def fake_acompletion(**_kwargs):
        return fake_stream()

    monkeypatch.setattr("backend.src.llm.providers.kimi_coding.litellm.acompletion", fake_acompletion)

    events = []
    async for event in provider.get_completion_stream(
        model="k2p5",
        messages=[{"role": "user", "content": "hi"}],
        tools=[{"type": "function", "function": {"name": "read_file", "parameters": {"type": "object"}}}],
    ):
        events.append(event)

    assert any(isinstance(event, ThinkingEvent) and event.content == "step-1" for event in events)
    chunk_text = "".join(event.content for event in events if isinstance(event, ChunkEvent))
    assert chunk_text == "Hello world"

    payload = provider.get_last_stream_response_payload()
    assert payload is not None
    assert payload["content"] == "Hello world"
    assert payload["finish_reason"] == "tool_calls"
    assert payload["tool_calls"] == [
        {
            "id": "call_1",
            "name": "read_file",
            "arguments": {"path": "/tmp/demo.txt"},
        }
    ]
