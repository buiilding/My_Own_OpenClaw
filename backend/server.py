"""
Main WebSocket server for the backend.
Handles IPC between the Electron frontend and the Python agent.
"""

import asyncio
import json
import logging

import websockets

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Store connected clients
connected_clients = set()


async def handler(websocket):
    """
    Handles incoming WebSocket connections.
    """
    connected_clients.add(websocket)
    logger.info(f"Client connected: {websocket.remote_address}")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                logger.info(f"Received message: {data}")

                # Simple ping-pong for testing
                if data.get("type") == "ping":
                    response = {
                        "type": "pong",
                        "id": data.get("id"),
                        "payload": "Hello from Python!",
                    }
                    await websocket.send(json.dumps(response))
                    logger.info(f"Sent pong to {websocket.remote_address}")

            except json.JSONDecodeError:
                logger.error("Received malformed JSON")
                await websocket.send(
                    json.dumps({"type": "error", "message": "Malformed JSON received."})
                )
            except Exception as e:
                logger.exception(f"Error processing message: {e}")
                await websocket.send(
                    json.dumps(
                        {"type": "error", "message": f"An error occurred: {str(e)}"}
                    )
                )
    except websockets.exceptions.ConnectionClosed as e:
        logger.info(
            f"Connection closed by client {websocket.remote_address}: {e.reason}"
        )
    except Exception as e:
        logger.exception(
            f"An unexpected error occurred with {websocket.remote_address}: {e}"
        )
    finally:
        connected_clients.remove(websocket)
        logger.info(f"Client disconnected: {websocket.remote_address}")


async def main():
    """
    Starts the WebSocket server.
    """
    host = "localhost"
    port = 8765
    logger.info(f"Starting WebSocket server on ws://{host}:{port}")
    async with websockets.serve(handler, host, port):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server shutting down.")
