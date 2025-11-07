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
from pydantic import ValidationError
from websockets.exceptions import ConnectionClosed
from websockets.server import WebSocketServerProtocol

from backend import config
from backend.agent.model_registry import get_all_models
from backend.agent.orchestrator import Agent
from backend.config import (
    CONFIG_FILE_NAME,
    AppConfig,
    get_config_dir,
    initialize_settings,
)
from backend.tools.tool_registry import create_tool_registry

# Configure logging


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)


logger = logging.getLogger(__name__)


# --- Global Instances ---


connected_clients: Set[WebSocketServerProtocol] = set()
agent: Agent | None = None  # To be initialized in main()

settings_lock = asyncio.Lock()
active_queries = 0  # pylint: disable=invalid-name
active_queries_lock = asyncio.Lock()
active_queries_done = asyncio.Event()
active_queries_done.set()  # Initially set since no queries are active
agent_lock = asyncio.Lock()


# pylint: disable=too-many-statements,too-many-branches
async def _handle_message(
    websocket: WebSocketServerProtocol, message_data: Dict[str, Any]
) -> None:
    """Routes incoming messages to the appropriate handlers.

    Args:
        websocket: The WebSocket connection instance.
        message_data: The parsed JSON data from the client.
    """
    global active_queries  # pylint: disable=global-statement
    # Note: agent is accessed but not assigned in this function
    # It's modified via method calls which pylint doesn't recognize as assignments
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
        query_text = message_data.get("payload", {}).get("text", "")

        # Validate query input
        if not query_text or not query_text.strip():
            response = {
                "type": "error",
                "id": message_id,
                "payload": {"message": "Query text cannot be empty"},
            }
            await websocket.send(json.dumps(response))
            return

        max_query_length = 10000  # Adjust based on your requirements
        if len(query_text) > max_query_length:
            response = {
                "type": "error",
                "id": message_id,
                "payload": {
                    "message": (
                        f"Query text exceeds maximum length of {max_query_length} "
                        "characters"
                    )
                },
            }
            await websocket.send(json.dumps(response))
            return

        logger.info("Received query: %s", query_text)

        # Increment active queries counter and clear done event
        async with active_queries_lock:
            active_queries += 1
            if active_queries == 1:
                active_queries_done.clear()

        try:
            # Define the streaming task to be timed out
            async def stream_query_with_timeout():
                # Access the global agent instance with lock protection
                async with agent_lock:
                    if not agent:
                        raise RuntimeError("Agent not initialized")
                    agent_instance = agent

                async for event in agent_instance.process_query(query_text):
                    # Check if client disconnected before processing event
                    if websocket.closed:
                        logger.info("Client disconnected during streaming")
                        break

                    if event["type"] == "thinking":
                        response = {
                            "type": "llm-thought",
                            "id": message_id,
                            "payload": {"status": event["content"]},
                        }
                    elif event["type"] == "chunk":
                        response = {
                            "type": "streaming-response",
                            "id": message_id,
                            "payload": {"text": event["content"]},
                        }
                    elif event["type"] == "tool_execution":
                        response = {
                            "type": "tool-execution",
                            "id": message_id,
                            "payload": {
                                "summary": event["content"],
                                "results": event["results"],
                            },
                        }
                    else:
                        # This case should ideally not be reached
                        logger.warning(
                            "Unknown event type from agent: %s", event.get("type")
                        )
                        continue

                    try:
                        await websocket.send(json.dumps(response))
                    except ConnectionClosed:
                        logger.info("Client disconnected during streaming")
                        break

                # Check if client disconnected before sending end-of-stream marker
                if not websocket.closed:
                    # Send end-of-stream marker
                    response = {
                        "type": "streaming-complete",
                        "id": message_id,
                        "payload": {},
                    }
                    try:
                        await websocket.send(json.dumps(response))
                        logger.info("Query completed successfully")
                    except ConnectionClosed:
                        logger.info("Client disconnected during streaming")
                else:
                    logger.info("Client disconnected during streaming")

            # Run the streaming task with a 5-minute timeout
            await asyncio.wait_for(stream_query_with_timeout(), timeout=300)

        except asyncio.TimeoutError:
            logger.error("Query timed out after 300 seconds")
            response = {
                "type": "error",
                "id": message_id,
                "payload": {"message": "Query processing timed out"},
            }
            await websocket.send(json.dumps(response))
        # pylint: disable=broad-exception-caught
        except Exception as e:
            logger.error("Error processing query: %s", e, exc_info=True)
            response = {
                "type": "error",
                "id": message_id,
                "payload": {"message": "An error occurred processing your query"},
            }
            await websocket.send(json.dumps(response))
        finally:
            # Decrement active queries counter and set done event if zero
            async with active_queries_lock:
                active_queries -= 1
                if active_queries == 0:
                    active_queries_done.set()

    elif message_type == "load-settings":
        logger.info("Loading and sending settings to frontend.")
        # Exclude the loaded API key from being sent to the frontend
        config_payload = config.settings.model_dump(exclude={"api_key"})
        response = {
            "type": "settings-loaded",
            "id": message_id,
            "payload": config_payload,
        }
        await websocket.send(json.dumps(response))

    elif message_type == "list-models":
        logger.info("Fetching available models.")
        try:
            models = await get_all_models()
            response = {
                "type": "models-listed",
                "id": message_id,
                "payload": models,
            }
            await websocket.send(json.dumps(response))
        # pylint: disable=broad-exception-caught
        except Exception as e:
            logger.error("Failed to fetch models: %s", e, exc_info=True)
            response = {
                "type": "error",
                "id": message_id,
                "payload": {"message": f"Failed to fetch models: {str(e)}"},
            }
            await websocket.send(json.dumps(response))

    elif message_type == "update-settings":
        logger.info("Received settings from frontend to update.")
        try:
            async with settings_lock:
                new_config_data = message_data.get("payload", {})

                # Merge with existing settings to preserve fields not sent by frontend
                merged_data = {**config.settings.model_dump(), **new_config_data}
                validated_config = AppConfig(**merged_data)

                # Reload the API key for the newly selected provider
                config.load_api_key_for_provider(validated_config)

                # Update the global settings object in-memory
                config.settings = validated_config

                # Update the agent's config
                async with agent_lock:
                    if agent:
                        await agent.update_config(validated_config)

                # Asynchronously write the updated config to file
                config_dir = get_config_dir()
                config_file = config_dir / CONFIG_FILE_NAME
                config_dir.mkdir(parents=True, exist_ok=True)

                def write_config():
                    with open(config_file, "w", encoding="utf-8") as f:
                        config_to_save = validated_config.model_dump(
                            exclude={"api_key"}
                        )
                        yaml.dump(
                            config_to_save,
                            f,
                            default_flow_style=False,
                            sort_keys=False,
                        )

                await asyncio.to_thread(write_config)

            logger.info("Successfully updated settings.")
            response = {
                "type": "settings-updated",
                "id": message_id,
                "payload": {"message": "Settings updated successfully"},
            }
            await websocket.send(json.dumps(response))
        except (ValueError, ValidationError, yaml.YAMLError, OSError) as e:
            logger.error("Failed to update settings: %s", e, exc_info=True)
            response = {
                "type": "error",
                "id": message_id,
                "payload": {"message": f"Failed to update settings: {str(e)}"},
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

                if (
                    data["type"] in ["query", "update-settings"]
                    and "payload" not in data
                ):
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
    """Initializes and starts the WebSocket server."""
    # Initialize settings before anything else
    initialize_settings()

    # Initialize tool registry
    tool_registry = create_tool_registry(config.settings)

    # Make agent a global variable to be accessible in the handler
    # pylint: disable=global-statement
    global agent
    agent = Agent(config.settings, tool_registry)

    host = "0.0.0.0"  # Listen on all interfaces
    port = 8765
    logger.info("Starting WebSocket server on ws://%s:%s", host, port)

    # Create handler with agent in closure
    async def websocket_handler(websocket: WebSocketServerProtocol) -> None:
        await handler(websocket)

    async with websockets.serve(websocket_handler, host, port, max_size=2**20):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server shutting down.")
