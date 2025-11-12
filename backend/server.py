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
from backend.agent import AgentSession
from backend.agent.llm.model_registry import get_all_models
from backend.config import (
    CONFIG_FILE_NAME,
    AppConfig,
    get_config_dir,
    get_settings,
    reload_settings,
)
from backend.memory.memory_manager import (
    end_session,
    run_summarization_periodically,
    start_session,
)
from backend.tools.registry import create_tool_registry

# Configure logging


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)


logger = logging.getLogger(__name__)


# --- Global Instances ---


connected_clients: Set[WebSocketServerProtocol] = set()
agent_sessions: Dict[str, AgentSession] = {}  # Maps user_id to AgentSession

settings_lock = asyncio.Lock()
active_queries = 0  # pylint: disable=invalid-name
active_queries_lock = asyncio.Lock()
active_queries_done = asyncio.Event()
active_queries_done.set()  # Initially set since no queries are active
agent_lock = asyncio.Lock()


async def _handle_ping(
    websocket: WebSocketServerProtocol, message_data: Dict[str, Any]
) -> None:
    """Handle ping messages by echoing back the payload text.

    Args:
        websocket: The WebSocket connection instance.
        message_data: The parsed JSON data from the client.
    """
    response_payload = {
        "text": message_data.get("payload", {}).get("text", "Echo: No text found")
    }
    response = {
        "type": "pong",
        "id": message_data.get("id"),
        "payload": response_payload,
    }
    await websocket.send(json.dumps(response))
    logger.info("Sent pong to %s", websocket.remote_address)


async def _handle_query(
    websocket: WebSocketServerProtocol, message_data: Dict[str, Any]
) -> None:
    """Handle query messages by processing them through the agent.

    Args:
        websocket: The WebSocket connection instance.
        message_data: The parsed JSON data from the client.
    """
    global active_queries  # pylint: disable=global-statement
    query_text = message_data.get("payload", {}).get("text", "")
    message_id = message_data.get("id")
    user_id = message_data.get("user_id", "default_user")  # Assume a user_id is passed

    # Get or create an agent session
    if user_id not in agent_sessions:
        settings = get_settings()
        tool_registry = create_tool_registry(settings)
        agent_sessions[user_id] = AgentSession(settings, tool_registry, user_id=user_id)
        start_session(user_id, agent_sessions[user_id].session_id)

    agent_instance = agent_sessions[user_id]

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
            # Access the agent instance for the user
            nonlocal agent_instance
            if not agent_instance:
                raise RuntimeError("Agent not initialized for this user")

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
                elif event["type"] == "tool_call":
                    response = {
                        "type": "tool-call",
                        "id": message_id,
                        "payload": {
                            "tool_name": event.get("tool_name"),
                            "parameters": event.get("parameters"),
                            "raw_call": event.get("raw_call"),
                        },
                    }
                elif event["type"] == "tool_output":
                    payload = {
                        "tool_name": event.get("tool_name"),
                        "success": event.get("success"),
                        "execution_time": event.get("execution_time"),
                        "output": event.get("output"),
                        "error": event.get("error"),
                    }
                    # Include screenshot if available
                    if event.get("screenshot"):
                        payload["screenshot"] = event.get("screenshot")
                    response = {
                        "type": "tool-output",
                        "id": message_id,
                        "payload": payload,
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

        # Run the streaming task with a timeout from the settings
        timeout_seconds = agent_instance.cfg.query_timeout if agent_instance else 300
        await asyncio.wait_for(stream_query_with_timeout(), timeout=timeout_seconds)

    except asyncio.TimeoutError:
        logger.error(f"Query timed out after {timeout_seconds} seconds")
        response = {
            "type": "error",
            "id": message_id,
            "payload": {"message": "Query processing timed out"},
        }
        await websocket.send(json.dumps(response))
    except RuntimeError as e:
        logger.error("Agent-related error: %s", e, exc_info=True)
        response = {
            "type": "error",
            "id": message_id,
            "payload": {"message": "An agent error occurred"},
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


async def _handle_load_settings(
    websocket: WebSocketServerProtocol, message_data: Dict[str, Any]
) -> None:
    """Handle load-settings messages by sending current config to frontend.

    Args:
        websocket: The WebSocket connection instance.
        message_data: The parsed JSON data from the client.
    """
    logger.info("Loading and sending settings to frontend.")
    # Exclude the loaded API key from being sent to the frontend
    config_payload = get_settings().model_dump(exclude={"api_key"})
    response = {
        "type": "settings-loaded",
        "id": message_data.get("id"),
        "payload": config_payload,
    }
    await websocket.send(json.dumps(response))


async def _handle_list_models(
    websocket: WebSocketServerProtocol, message_data: Dict[str, Any]
) -> None:
    """Handle list-models messages by fetching available models.

    Args:
        websocket: The WebSocket connection instance.
        message_data: The parsed JSON data from the client.
    """
    logger.info("Fetching available models.")
    try:
        models = await get_all_models()
        response = {
            "type": "models-listed",
            "id": message_data.get("id"),
            "payload": models,
        }
        await websocket.send(json.dumps(response))
    # pylint: disable=broad-exception-caught
    except Exception as e:
        logger.error("Failed to fetch models: %s", e, exc_info=True)
        response = {
            "type": "error",
            "id": message_data.get("id"),
            "payload": {"message": f"Failed to fetch models: {str(e)}"},
        }
        await websocket.send(json.dumps(response))


async def _handle_update_settings(
    websocket: WebSocketServerProtocol, message_data: Dict[str, Any]
) -> None:
    """Handle update-settings messages by validating and saving new config.

    Args:
        websocket: The WebSocket connection instance.
        message_data: The parsed JSON data from the client.
    """
    logger.info("Received settings from frontend to update.")
    try:
        async with settings_lock:
            new_config_data = message_data.get("payload", {})

            # Merge with existing settings to preserve fields not sent by frontend
            merged_data = {**get_settings().model_dump(), **new_config_data}
            validated_config = AppConfig(**merged_data)
            
            # Log the provider and model mode for debugging
            logger.info(
                "Updating settings: model_mode=%s, model_provider=%s, selected_model_id=%s",
                validated_config.model_mode,
                validated_config.model_provider,
                validated_config.selected_model_id,
            )

            # Log the provider and model mode for debugging
            logger.info(
                "Updating settings: model_mode=%s, model_provider=%s, selected_model_id=%s",
                validated_config.model_mode,
                validated_config.model_provider,
                validated_config.selected_model_id,
            )

            # Reload the API key for the newly selected provider
            config.load_api_key_for_provider(validated_config)

            # Update the global settings object directly with the validated config
            # (instead of reloading from disk, which would have old values)
            config.settings = validated_config

            # Update all agent sessions' config
            async with agent_lock:
                for user_id, agent_session in agent_sessions.items():
                    await agent_session.update_config(validated_config)

            # Asynchronously write the updated config to file
            config_dir = get_config_dir()
            config_file = config_dir / CONFIG_FILE_NAME
            config_dir.mkdir(parents=True, exist_ok=True)

            def write_config():
                with open(config_file, "w", encoding="utf-8") as f:
                    config_to_save = validated_config.model_dump(exclude={"api_key"})
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
            "id": message_data.get("id"),
            "payload": {"message": "Settings updated successfully"},
        }
        await websocket.send(json.dumps(response))
    except (ValueError, ValidationError, yaml.YAMLError, OSError) as e:
        logger.error("Failed to update settings: %s", e, exc_info=True)
        response = {
            "type": "error",
            "id": message_data.get("id"),
            "payload": {"message": f"Failed to update settings: {str(e)}"},
        }
        await websocket.send(json.dumps(response))


async def _handle_message(
    websocket: WebSocketServerProtocol, message_data: Dict[str, Any]
) -> None:
    """Routes incoming messages to the appropriate handlers.

    Args:
        websocket: The WebSocket connection instance.
        message_data: The parsed JSON data from the client.
    """
    message_type = message_data.get("type")

    if message_type == "ping":
        await _handle_ping(websocket, message_data)
    elif message_type == "query":
        await _handle_query(websocket, message_data)
    elif message_type == "load-settings":
        await _handle_load_settings(websocket, message_data)
    elif message_type == "list-models":
        await _handle_list_models(websocket, message_data)
    elif message_type == "update-settings":
        await _handle_update_settings(websocket, message_data)
    else:
        logger.warning("Received unknown message type: '%s'", message_type)
        message_id = message_data.get("id")
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
    user_id = None  # To be determined from a handshake message

    logger.info("Client connected: %s", websocket.remote_address)

    try:
        # Simple handshake to get user_id
        handshake_message = await websocket.recv()
        handshake_data = json.loads(handshake_message)
        if handshake_data.get("type") == "handshake":
            user_id = handshake_data.get("user_id", "default_user")
            logger.info("Handshake successful for user %s", user_id)
        else:
            await websocket.close(reason="Handshake failed")
            return

        async for message in websocket:
            try:
                data = json.loads(message)
                data["user_id"] = user_id  # Inject user_id into all messages

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

            except Exception as e:
                logger.error(
                    "Unexpected error processing message: %s", e, exc_info=True
                )
                message_id = None
                try:
                    # Try to get message id if data was parsed successfully
                    parsed_data = json.loads(message)
                    message_id = parsed_data.get("id")
                except Exception:
                    pass  # Ignore if we can't parse for id

                try:
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "error",
                                "id": message_id,
                                "payload": {"message": f"An error occurred: {str(e)}"},
                            }
                        )
                    )
                except Exception:
                    # If we can't send error message, connection is likely broken
                    logger.error("Failed to send error message to client")
                    break

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
        if user_id:
            end_session(user_id)
            if user_id in agent_sessions:
                del agent_sessions[user_id]

        logger.info("Client disconnected: %s", websocket.remote_address)


async def main() -> None:
    """Initializes and starts the WebSocket server."""
    # Start the background summarization task
    asyncio.create_task(run_summarization_periodically())

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
