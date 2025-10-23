"""Tests for the Agent Orchestrator."""

import pytest
from unittest.mock import AsyncMock, patch

from backend.agent.orchestrator import Agent, SYSTEM_PROMPT, MAX_HISTORY_LENGTH

# Mark all tests in this file as async
pytestmark = pytest.mark.asyncio


@pytest.fixture
def mock_llm_client():
    """Fixture to provide a mocked LLMClient."""
    mock_client = AsyncMock()

    async def stream_generator(*args, **kwargs):
        yield "Hello"
        yield " from "
        yield "the mock!"

    mock_client.get_completion_stream.side_effect = stream_generator
    return mock_client


@patch('backend.agent.orchestrator.get_llm_client')
async def test_agent_initialization(mock_get_llm_client, mock_llm_client):
    """Test that the agent initializes correctly and gets an LLM client."""
    mock_get_llm_client.return_value = mock_llm_client
    agent = Agent()
    assert agent.llm_client is not None
    mock_get_llm_client.assert_called_once()


@patch('backend.agent.orchestrator.get_llm_client')
async def test_agent_process_query_streaming(mock_get_llm_client, mock_llm_client):
    """Test that process_query correctly streams the response."""
    mock_get_llm_client.return_value = mock_llm_client
    agent = Agent()

    query = "Test query"

    # Consume the stream
    response_chunks = [chunk async for chunk in agent.process_query(query)]
    full_response = "".join(response_chunks)

    assert full_response == "Hello from the mock!"

    # Verify that the prompt was constructed correctly
    expected_prompt = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": query},
    ]
    # We need to access the arguments of the mocked async generator
    mock_llm_client.get_completion_stream.assert_called_once_with(expected_prompt)


@patch('backend.agent.orchestrator.get_llm_client')
async def test_agent_history_management(mock_get_llm_client, mock_llm_client):
    """Test that the agent correctly manages conversation history."""
    mock_get_llm_client.return_value = mock_llm_client
    agent = Agent()

    # First interaction
    query1 = "First query"
    _ = [chunk async for chunk in agent.process_query(query1)]

    assert len(agent.history) == 2
    assert agent.history[0] == {"role": "user", "content": query1}
    assert agent.history[1] == {"role": "assistant", "content": "Hello from the mock!"}

    # Second interaction
    query2 = "Second query"
    _ = [chunk async for chunk in agent.process_query(query2)]

    assert len(agent.history) == 4

    # Verify the prompt for the second query contained the history of the first
    expected_prompt = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": query1},
        {"role": "assistant", "content": "Hello from the mock!"},
        {"role": "user", "content": query2},
    ]
    mock_llm_client.get_completion_stream.assert_called_with(expected_prompt)


@patch('backend.agent.orchestrator.get_llm_client')
async def test_agent_history_pruning(mock_get_llm_client, mock_llm_client):
    """Test that the agent prunes history when it exceeds the max length."""
    mock_get_llm_client.return_value = mock_llm_client
    agent = Agent()

    # Fill the history just over the max length
    for i in range(MAX_HISTORY_LENGTH // 2 + 1):
        _ = [chunk async for chunk in agent.process_query(f"Query {i}")]

    # The history should be exactly the max length
    assert len(agent.history) == MAX_HISTORY_LENGTH

    # The first message should be from the second interaction, not the first
    assert agent.history[0]["content"] != "Query 0"
    assert agent.history[0]["content"] == "Query 1"
