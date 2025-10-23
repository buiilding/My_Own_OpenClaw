"""Main WebSocket server for the backend.

Handles IPC between the Electron frontend and the Python agent, routing
messages and managing the client connection lifecycle.
"""

import asyncio
import json
import logging
from typing import Any, Dict, Set

import websockets
import yaml
from websockets.exceptions import ConnectionClosed
from websockets.server import (  # pylint: disable=no-name-in-module
    WebSocketServerProtocol,
)

from backend.config import CONFIG_FILE_NAME, AppConfig, get_config_dir, settings

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

    global settings

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

    elif message_type == "load-settings":
        logger.info("Loading and sending settings to frontend.")

        # Exclude the loaded API key from being sent to the frontend

        config_payload = settings.model_dump(exclude={"api_key"})

        response = {
            "type": "settings-loaded",
            "id": message_id,
            "payload": config_payload,
        }

        await websocket.send(json.dumps(response))

    elif message_type == "save-settings":
        logger.info("Received settings from frontend to save.")

        try:
            new_config_data = message_data.get("payload", {})

            # Merge with existing settings to preserve api_key
            merged_data = {**settings.model_dump(), **new_config_data}
            validated_config = AppConfig(**merged_data)

            # Update the global settings object in-place
            for key, value in validated_config.model_dump().items():
                setattr(settings, key, value)

            config_dir = get_config_dir()
            config_file = config_dir / CONFIG_FILE_NAME
            config_dir.mkdir(parents=True, exist_ok=True)

            with open(config_file, "w", encoding="utf-8") as f:
                # Save the validated data, excluding the runtime api_key

                config_to_save = validated_config.model_dump(exclude={"api_key"})

                yaml.dump(config_to_save, f, default_flow_style=False, sort_keys=False)

            logger.info("Successfully saved new settings to %s", config_file)

            response = {
                "type": "settings-saved",
                "id": message_id,
                "payload": {"message": "Settings saved successfully"},
            }
            await websocket.send(json.dumps(response))
        except Exception as e:
            logger.error("Failed to save settings: %s", e, exc_info=True)

            response = {
                "type": "error",
                "id": message_id,
                "payload": {"message": f"Failed to save settings: {str(e)}"},
            }
            await websocket.send(json.dumps(response))
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
                # Basic validation for required keys
                if "type" not in data or "id" not in data:
                    raise KeyError("Message missing required keys: id or type")

                # Stricter validation for messages that require a payload
                if data["type"] in ["query", "save-settings"] and "payload" not in data:
                    raise KeyError(
                        f"Message type '{data['type']}' missing required key: payload"
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
    host = ""  # Listen on all interfaces (IPv4 and IPv6)
    port = 8765
    logger.info("Starting WebSocket server on ws://%s:%s", host, port)
    async with websockets.serve(handler, host, port):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server shutting down.")
