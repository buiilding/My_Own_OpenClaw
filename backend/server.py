"""
Main WebSocket server for the backend.
Handles IPC between the Electron frontend and the Python agent.
"""

import asyncio
import json
import logging
from typing import Set

import websockets
from websockets.server import WebSocketServerProtocol

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Store connected clients
connected_clients: Set[WebSocketServerProtocol] = set()


async def handler(websocket: WebSocketServerProtocol) -> None:
    """Handles incoming WebSocket connections and routes messages.

    This function listens for messages from a connected client, decodes them,
    and routes them to the appropriate logic based on the message 'type'.
    It maintains the connection until the client disconnects.

    Args:
        websocket: The WebSocketServerProtocol instance for the connection.
    """
    connected_clients.add(websocket)
    logger.info("Client connected: %s", websocket.remote_address)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                logger.info("Received message: %s", data)

                # Simple ping-pong for testing
                if data.get("type") == "ping":
                    response = {
                        "type": "pong",
                        "id": data.get("id"),
                        "payload": "Hello from Python!",
                    }
                    await websocket.send(json.dumps(response))
                    logger.info("Sent pong to %s", websocket.remote_address)

            except json.JSONDecodeError:
                logger.error("Received malformed JSON")
                await websocket.send(
                    json.dumps({"type": "error", "message": "Malformed JSON received."})
                )
            except Exception:
                logger.exception("Error processing message")
                await websocket.send(
                    json.dumps(
                        {"type": "error", "message": "An internal error occurred."}
                    )
                )
    except websockets.exceptions.ConnectionClosed as e:
        logger.info(
            "Connection closed by client %s: %s", websocket.remote_address, e.reason
        )
    except Exception:
        logger.exception(
            "An unexpected error occurred with %s", websocket.remote_address
        )
    finally:
        connected_clients.remove(websocket)
        logger.info("Client disconnected: %s", websocket.remote_address)


async def main() -> None:
    """Initializes and starts the WebSocket server.

    This function sets up the server to listen on a specified host and port
    and runs indefinitely until the process is terminated.
    """
    host = "localhost"
    port = 8765
    logger.info("Starting WebSocket server on ws://%s:%s", host, port)
    async with websockets.serve(handler, host, port):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server shutting down.")
