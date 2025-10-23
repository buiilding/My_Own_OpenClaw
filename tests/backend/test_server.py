"""
Tests for the backend WebSocket server.
"""

import asyncio
import json
import pytest
import websockets

from backend.server import handler

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio

async def start_server_in_background():
    """Starts the server in a background task."""
    server = await websockets.serve(handler, "localhost", 8765)
    loop = asyncio.get_running_loop()
    task = loop.create_task(asyncio.sleep(10)) # Keep server running for the test

    async def cleanup():
        await task
        server.close()
        await server.wait_closed()

    loop.create_task(cleanup())
    return server

async def test_ping_pong_communication():
    """
    Tests that the server responds to a 'ping' with a 'pong'.
    """
    server_task = await start_server_in_background()

    uri = "ws://localhost:8765"
    try:
        async with websockets.connect(uri) as websocket:
            # 1. Send a ping message
            ping_message = {
                "id": "test-123",
                "type": "ping",
                "payload": "Test payload"
            }
            await websocket.send(json.dumps(ping_message))

            # 2. Wait for the response
            response_raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            response_data = json.loads(response_raw)

            # 3. Assert the response is correct
            assert response_data["type"] == "pong"
            assert response_data["id"] == "test-123"
            assert response_data["payload"] == "Hello from Python!"
    finally:
        # Clean up the server task
        server_task.close()
        await server_task.wait_closed()

async def test_malformed_json():
    """
    Tests that the server handles malformed JSON gracefully.
    """
    server_task = await start_server_in_background()

    uri = "ws://localhost:8765"
    try:
        async with websockets.connect(uri) as websocket:
            await websocket.send("this is not json")

            response_raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
            response_data = json.loads(response_raw)

            assert response_data["type"] == "error"
            assert "Malformed JSON" in response_data["message"]
    finally:
        server_task.close()
        await server_task.wait_closed()
