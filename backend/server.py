"""Main WebSocket server for the backend.

Handles IPC between the Electron frontend and the Python agent, routing
messages and managing the client connection lifecycle.
"""

import asyncio
import json
import logging
from typing import Any, Dict, Set

import websockets
from websockets.exceptions import ConnectionClosed
from websockets.server import (  # pylint: disable=no-name-in-module
    WebSocketServerProtocol,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Store connected clients
connected_clients: Set[WebSocketServerProtocol] = set()


async def _handle_message(
    websocket: WebSocketServerProtocol, message_data: Dict[str, Any]
) -> None:
    """Routes incoming messages to the appropriate handlers.

    Args:
        websocket: The WebSocket connection instance.
        message_data: The parsed JSON data from the client.
    """
    message_type = message_data.get("type")
    message_id = message_data.get("id")

    if message_type == "ping":
        response_payload = {
            "text": message_data.get("payload", {}).get("text", "Echo: No text found")
        }
        response = {"type": "pong", "id": message_id, "payload": response_payload}
        await websocket.send(json.dumps(response))
        logger.info("Sent pong to %s", websocket.remote_address)

    elif message_type == "query":
        # TODO: This is a placeholder. In the future, this will call the agent orchestrator.
        query_text = message_data.get("payload", {}).get("text", "")
        logger.info("Received query: %s", query_text)
        response_payload = {
            "text": (
                f"Received your query: '{query_text}'. "
                "The agent is not yet connected."
            )
        }
        response = {"type": "response", "id": message_id, "payload": response_payload}
        await websocket.send(json.dumps(response))
        logger.info("Sent query response to %s", websocket.remote_address)

    else:
        logger.warning("Received unknown message type: '%s'", message_type)
        response = {
            "type": "error",
            "id": message_id,
            "payload": {"message": f"Unknown message type: {message_type}"},
        }
        await websocket.send(json.dumps(response))


async def handler(websocket: WebSocketServerProtocol) -> None:
    """Handles a client connection and processes its messages.

    This function manages the lifecycle of a single client connection,
    listening for messages, validating them, and passing them to the
    message router. It also handles connection cleanup.

    Args:
        websocket: The WebSocketServerProtocol instance for the connection.
    """
    connected_clients.add(websocket)
    logger.info("Client connected: %s", websocket.remote_address)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                # Validate required fields
                if not all(k in data for k in ["id", "type", "payload"]):
                    raise KeyError(
                        "Message missing required keys: id, type, or payload"
                    )
                await _handle_message(websocket, data)

            except json.JSONDecodeError:
                logger.error("Received malformed JSON")
                await websocket.send(
                    json.dumps(
                        {
                            "type": "error",
                            "id": None,
                            "payload": {"message": "Malformed JSON"},
                        }
                    )
                )
            except (KeyError, TypeError) as e:
                logger.error("Message validation failed: %s", e)
                await websocket.send(
                    json.dumps(
                        {"type": "error", "id": None, "payload": {"message": str(e)}}
                    )
                )

    except ConnectionClosed as e:
        logger.info(
            "Connection closed by client %s: %s", websocket.remote_address, e.reason
        )
    except websockets.exceptions.WebSocketException as e:
        # This is a fallback for unexpected errors during connection handling.
        logger.exception(
            "An unexpected WebSocket error occurred with client %s: %s",
            websocket.remote_address,
            e,
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
