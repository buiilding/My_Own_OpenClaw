"""
Tests for MockLLMClient native tool-call payload behavior.
"""

from unittest import mock

import pytest

from backend.src.simulation.mock_llm_client import MockLLMClient


@pytest.mark.asyncio
async def test_get_completion_response_returns_native_tool_calls():
    mock_cfg = mock.Mock()
    client = MockLLMClient(mock_cfg)

    result = await client.get_completion_response("gpt-4", [], tools=[{}])

    assert result["content"] == ""
    assert result["finish_reason"] == "tool_calls"
    assert len(result["tool_calls"]) == 1
    tool_call = result["tool_calls"][0]
    assert tool_call["id"].startswith("simulation_call_0_")
    assert tool_call["name"] == "run_shell_command"
    assert tool_call["arguments"]["run_in_background"] is True


@pytest.mark.asyncio
async def test_get_completion_response_preserves_computer_metadata():
    mock_cfg = mock.Mock()
    client = MockLLMClient(mock_cfg)
    client._iteration = 1

    result = await client.get_completion_response("gpt-4", [], tools=[{}])

    assert result["content"] == ""
    tool_call = result["tool_calls"][0]
    assert tool_call["name"] == "mouse_control"
    assert tool_call["arguments"]["action"] == "click"
    assert tool_call["arguments"]["metadata"]["explanation"].startswith("Clicking on")


@pytest.mark.asyncio
async def test_get_completion_response_handles_multi_tool_turn():
    mock_cfg = mock.Mock()
    client = MockLLMClient(mock_cfg)
    client._iteration = 2

    result = await client.get_completion_response("gpt-4", [], tools=[{}])

    assert result["content"] == ""
    assert len(result["tool_calls"]) == 2
    assert [call["name"] for call in result["tool_calls"]] == [
        "keyboard_control",
        "keyboard_control",
    ]


@pytest.mark.asyncio
async def test_get_completion_response_final_turn_returns_plain_text():
    mock_cfg = mock.Mock()
    client = MockLLMClient(mock_cfg)
    client._iteration = client._max_iterations - 1

    result = await client.get_completion_response("gpt-4", [], tools=[{}])

    assert "tool_calls" not in result
    assert "task is complete" in result["content"].lower()
