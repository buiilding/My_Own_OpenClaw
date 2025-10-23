"""
Tests for the backend WebSocket server.
"""

import asyncio
import json

import pytest
import websockets

# Import the handler from the server file
from backend.server import handler

# Use pytest-asyncio for async tests
pytestmark = pytest.mark.asyncio


async def test_ping_pong():
    """
    Tests that the server correctly handles a ping message
    and responds with a pong.
    """
    # This context manager starts the server and provides a client connection
    async with websockets.serve(handler, "localhost", 8766):
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
    async with websockets.serve(handler, "localhost", 8767):
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
    async with websockets.serve(handler, "localhost", 8768) as server:
        async with websockets.connect("ws://localhost:8768") as websocket:
            query_message = {
                "id": "test-query-123",
                "type": "query",
                "payload": {"text": "What is the weather?"},
            }
            await websocket.send(json.dumps(query_message))
            response_raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            response_data = json.loads(response_raw)

            assert response_data["type"] == "response"
            assert response_data["id"] == "test-query-123"
            assert "Received your query" in response_data["payload"]["text"]


async def test_unknown_message_type():
    """
    Tests that the server sends an error for an unknown message type.
    """
    async with websockets.serve(handler, "localhost", 8769) as server:
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
    async with websockets.serve(handler, "localhost", 8770) as server:
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
