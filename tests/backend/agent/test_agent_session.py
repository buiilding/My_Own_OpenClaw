"""Tests for the Agent Session."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from backend.agent import AgentSession
from backend.config import AppConfig
from backend.agent.prompts import SYSTEM_PROMPT
from backend.agent.agent_session import MAX_TOOL_ITERATIONS
from backend.agent.state.conversation_history import MAX_HISTORY_LENGTH

# Mark all tests in this file as async
pytestmark = pytest.mark.asyncio


@pytest.fixture
def mock_llm_client():
    """Fixture to provide a mocked LLMClient."""
    mock_client = MagicMock()

    # A factory that returns a new async generator each time
    def factory(*args, **kwargs):
        async def generator():
            yield {"type": "thinking", "content": "Mock is thinking..."}
            yield {"type": "chunk", "content": "Hello"}
            yield {"type": "chunk", "content": " from "}
            yield {"type": "chunk", "content": "the mock!"}
        return generator()

    # get_completion_stream should be a mock that when called,
    # returns an async generator from the factory
    mock_client.get_completion_stream = MagicMock(side_effect=factory)
    return mock_client


@patch('backend.agent.orchestrator.get_llm_client')
async def test_agent_initialization(mock_get_llm_client, mock_llm_client):
    """Test that the agent initializes correctly and gets an LLM client."""
    mock_get_llm_client.return_value = mock_llm_client
    agent = AgentSession(AppConfig())
    assert agent.llm_client is not None
    mock_get_llm_client.assert_called_once()


@patch('backend.agent.orchestrator.get_llm_client')
async def test_agent_process_query_streaming(mock_get_llm_client, mock_llm_client):
    """Test that process_query correctly streams the response."""
    mock_get_llm_client.return_value = mock_llm_client
    agent = AgentSession(AppConfig())

    query = "Test query"

    # Consume the stream
    response_events = [event async for event in agent.process_query(query)]
    response_chunks = [
        event["content"] for event in response_events if event["type"] == "chunk"
    ]
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
    agent = AgentSession(AppConfig())

    # First interaction
    query1 = "First query"
    response_events1 = [event async for event in agent.process_query(query1)]
    full_response1 = "".join(
        [event["content"] for event in response_events1 if event["type"] == "chunk"]
    )

    assert len(agent.history) == 2
    assert agent.history[0] == {"role": "user", "content": query1}
    assert agent.history[1] == {"role": "assistant", "content": full_response1}

    # Second interaction
    query2 = "Second query"
    response_events2 = [event async for event in agent.process_query(query2)]
    full_response2 = "".join(
        [event["content"] for event in response_events2 if event["type"] == "chunk"]
    )

    assert len(agent.history) == 4

    # Verify the prompt for the second query contained the history of the first
    expected_prompt = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": query1},
        {"role": "assistant", "content": full_response1},
        {"role": "user", "content": query2},
    ]
    mock_llm_client.get_completion_stream.assert_called_with(expected_prompt)


@patch('backend.agent.orchestrator.get_llm_client')
async def test_agent_history_pruning(mock_get_llm_client, mock_llm_client):
    """Test that the agent prunes history when it exceeds the max length."""
    mock_get_llm_client.return_value = mock_llm_client
    agent = AgentSession(AppConfig())

    # Fill the history just over the max length
    for i in range(MAX_HISTORY_LENGTH // 2 + 1):
        # We need to consume the generator to make the agent update its history
        _ = [event async for event in agent.process_query(f"Query {i}")]

    # The history should be exactly the max length
    assert len(agent.history) == MAX_HISTORY_LENGTH

    # The first message should be from the second interaction, not the first
    assert agent.history[0]["content"] != "Query 0"
    assert "Query 1" in agent.history[0]["content"]
