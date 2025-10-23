"""
Tests for the backend WebSocket server.
"""

import asyncio
import json
import yaml
from unittest.mock import patch, AsyncMock, MagicMock
from functools import partial

import pytest
import websockets
from backend.agent.orchestrator import Agent
from backend.config import AppConfig
from backend.server import handler

# Use pytest-asyncio for async tests
pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def mock_agent_dependencies(monkeypatch):
    """
    Mocks dependencies needed to instantiate the Agent without making real
    API calls or needing a real config. This provides a correctly mocked
    LLM client that supports async streaming.
    """
    mock_llm = MagicMock()

    def factory(*args, **kwargs):
        async def generator():
            yield "Mock response"
        return generator()

    mock_llm.get_completion_stream = MagicMock(side_effect=factory)

    # Mock the get_llm_client function to return our perfected mock
    monkeypatch.setattr(
        "backend.agent.orchestrator.get_llm_client", lambda: mock_llm
    )



@pytest.fixture(autouse=True)
def mock_server_settings(monkeypatch):
    """
    Mocks the global settings object used by the server handler to ensure
    test isolation and prevent AttributeError for 'NoneType'.
    """
    # The handler function in server.py imports 'settings' directly.
    # We must patch it in that module's namespace.
    monkeypatch.setattr("backend.server.settings", AppConfig())


async def test_ping_pong():
    """
    Tests that the server correctly handles a ping message
    and responds with a pong.
    """
    # This context manager starts the server and provides a client connection
    agent = Agent()
    server_handler = partial(handler, agent=agent)
    async with websockets.serve(server_handler, "localhost", 8766):
        async with websockets.connect("ws://localhost:8766") as websocket:
            # 1. Send a ping message
            ping_message = {
                "id": "test-uuid-123",
                "type": "ping",
                "payload": {"text": "Hello, server!"},
            }
            await websocket.send(json.dumps(ping_message))

            # 2. Receive the response
            response_raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            response_data = json.loads(response_raw)

            # 3. Assert the response is correct
            assert response_data["type"] == "pong"
            assert response_data["id"] == "test-uuid-123"
            assert response_data["payload"]["text"] == "Hello, server!"


async def test_invalid_json():
    """
    Tests that the server sends an error message when it
    receives malformed JSON.
    """
    agent = Agent()
    server_handler = partial(handler, agent=agent)
    async with websockets.serve(server_handler, "localhost", 8767):
        async with websockets.connect("ws://localhost:8767") as websocket:
            await websocket.send("this is not json")
            response_raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            response_data = json.loads(response_raw)

            assert response_data["type"] == "error"
            assert response_data["payload"]["message"] == "Malformed JSON"


async def test_query_message():
    """
    Tests that the server correctly handles a query message
    and responds appropriately.
    """
    agent = Agent()
    server_handler = partial(handler, agent=agent)
    async with websockets.serve(server_handler, "localhost", 8768):
        async with websockets.connect("ws://localhost:8768") as websocket:
            query_message = {
                "id": "test-query-123",
                "type": "query",
                "payload": {"text": "What is the weather?"},
            }
            await websocket.send(json.dumps(query_message))

            # The server now sends a stream, so we receive until we get the 'complete' message
            while True:
                response_raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                response_data = json.loads(response_raw)
                if response_data["type"] == "streaming-complete":
                    break

            assert response_data["type"] == "streaming-complete"
            assert response_data["id"] == "test-query-123"


async def test_unknown_message_type():
    """
    Tests that the server sends an error for an unknown message type.
    """
    agent = Agent()
    server_handler = partial(handler, agent=agent)
    async with websockets.serve(server_handler, "localhost", 8769):
        async with websockets.connect("ws://localhost:8769") as websocket:
            message = {
                "id": "test-unknown-123",
                "type": "unknown_type",
                "payload": {},
            }
            await websocket.send(json.dumps(message))
            response_raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            response_data = json.loads(response_raw)

            assert response_data["type"] == "error"
            assert "Unknown message type" in response_data["payload"]["message"]


async def test_missing_key():
    """
    Tests that the server sends an error if a required key is missing.
    """
    agent = Agent()
    server_handler = partial(handler, agent=agent)
    async with websockets.serve(server_handler, "localhost", 8770):
        async with websockets.connect("ws://localhost:8770") as websocket:
            message = {
                "type": "query",
                "payload": {"text": "This message is missing an id"},
            }
            await websocket.send(json.dumps(message))
            response_raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            response_data = json.loads(response_raw)

            assert response_data["type"] == "error"
            assert "Message missing required keys" in response_data["payload"]["message"]


async def test_handle_load_settings():
    """
    Tests that the server correctly sends its configuration when requested.
    """
    agent = Agent()
    server_handler = partial(handler, agent=agent)
    async with websockets.serve(server_handler, "localhost", 8771):
        async with websockets.connect("ws://localhost:8771") as websocket:
            # Note: The frontend doesn't need to send a payload for this type
            load_msg = {"id": "test-load-settings", "type": "load-settings"}
            await websocket.send(json.dumps(load_msg))

            response_raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            response_data = json.loads(response_raw)

            assert response_data["type"] == "settings-loaded"
            assert response_data["payload"]["active_provider"] == "openai"
            assert "api_key" not in response_data["payload"] # Ensure key is not sent


async def test_handle_save_settings(tmp_path):
    """
    Tests that the server can receive and save new settings.
    """
    # Use a temporary directory for the config file to avoid side effects
    mock_config_dir = tmp_path / "TestApp"
    mock_config_file = mock_config_dir / "config.yaml"

    # Patch the config directory function in both the config and server modules
    agent = Agent()
    server_handler = partial(handler, agent=agent)
    with patch('backend.config.get_config_dir', return_value=mock_config_dir), \
         patch('backend.server.get_config_dir', return_value=mock_config_dir):
        async with websockets.serve(server_handler, "localhost", 8772):
            async with websockets.connect("ws://localhost:8772") as websocket:
                new_settings = {
                    "active_provider": "ollama",
                    "preferences": {"user_name": "Test User"},
                    "llm_providers": {
                        "openai": {}, "anthropic": {}, "google": {}, "ollama": {},
                        "openrouter": {}, "mistral": {}
                    }
                }
                save_msg = {
                    "id": "test-save-settings",
                    "type": "save-settings",
                    "payload": new_settings
                }
                await websocket.send(json.dumps(save_msg))

                # Poll for the file's existence to avoid flaky sleeps
                for _ in range(100):  # Poll for up to 1 second
                    if mock_config_file.exists():
                        break
                    await asyncio.sleep(0.01)
                else:
                    pytest.fail("Config file was not created in time")

                # Verify the file was written correctly
                assert mock_config_file.exists()
                with open(mock_config_file, "r") as f:
                    saved_data = yaml.safe_load(f)

                assert saved_data["active_provider"] == "ollama"
                assert saved_data["preferences"]["user_name"] == "Test User"
