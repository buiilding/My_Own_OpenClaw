#!/usr/bin/env python3
"""
Minimal Python Memory Service

Handles only FAISS/memory operations with simple JSON protocol over stdin/stdout.
No tool execution, no system state capture.
"""

import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict

# Add the frontend python directory to the path
frontend_python_dir = Path(__file__).parent
sys.path.insert(0, str(frontend_python_dir))

from memory.local_store import LocalMemoryStore
from memory.operations import (
    build_interaction_metadata,
    build_memory_filters,
    format_interaction_memory,
    group_memory_texts,
)
from core.runtime_shutdown import (
    handle_shutdown_signal,
    register_shutdown_signal_handlers,
    request_stdin_shutdown,
)
from core.stdout_json import write_json_line

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr to avoid interfering with stdout protocol
)
logger = logging.getLogger(__name__)
_active_service: "MemoryService | None" = None


class MemoryService:
    """
    Minimal memory service for FAISS operations only.
    Uses simple JSON request/response protocol over stdin/stdout.
    """

    def __init__(self):
        self.memory_store = None
        self.running = False
        self._shutdown_requested = False

    async def initialize(self) -> None:
        """Initialize the memory store."""
        logger.info("Initializing memory service...")
        try:
            self.memory_store = LocalMemoryStore()
            await self.memory_store.initialize()
            logger.info("Memory store initialized")
        except Exception as e:
            logger.error(f"Failed to initialize memory store: {e}", exc_info=True)
            raise

    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle a memory service request.
        
        Request format:
        {
            "id": "request-id",
            "type": "search" | "store",
            "payload": {...}
        }
        
        Response format:
        {
            "id": "request-id",
            "success": true/false,
            "data": {...} or "error": "..."
        }
        """
        if not isinstance(request, dict):
            return {
                "id": "unknown",
                "success": False,
                "error": "Request must be a JSON object",
            }

        request_id = request.get("id", "unknown")
        request_type = request.get("type")
        payload = request.get("payload")
        if payload is None:
            payload = {}
        elif not isinstance(payload, dict):
            return {
                "id": request_id,
                "success": False,
                "error": "Request payload must be a JSON object",
            }

        try:
            if request_type == "search":
                return await self.handle_search(request_id, payload)
            elif request_type == "store":
                return await self.handle_store(request_id, payload)
            else:
                return {
                    "id": request_id,
                    "success": False,
                    "error": f"Unknown request type: {request_type}"
                }
        except Exception as e:
            logger.error(f"Error handling request: {e}", exc_info=True)
            return {
                "id": request_id,
                "success": False,
                "error": str(e)
            }

    async def handle_search(self, request_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory search request."""
        query = payload.get("query")
        user_id = payload.get("user_id", "default_user")
        limit = payload.get("limit", 5)
        memory_type = payload.get("memory_type")

        if not query:
            return {
                "id": request_id,
                "success": False,
                "error": "Query is required for memory search"
            }

        try:
            filters = build_memory_filters(memory_type)

            # Search memory store
            results = await self.memory_store.search(query, user_id, filters, limit)

            memories = group_memory_texts(results)

            logger.info(f"Memory search returned {len(results)} results for query: '{query}'")

            return {
                "id": request_id,
                "success": True,
                "data": {
                    "memories": memories
                }
            }
        except Exception as e:
            logger.error(f"Memory search failed: {e}", exc_info=True)
            return {
                "id": request_id,
                "success": False,
                "error": f"Memory search failed: {str(e)}"
            }

    async def handle_store(self, request_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory store request."""
        user_query = (payload.get("user_query") or "").strip()
        assistant_response = (payload.get("assistant_response") or "").strip()
        memory_type = payload.get("memory_type", "episodic")
        user_id = payload.get("user_id", "default_user")
        session_id = payload.get("session_id")

        if not user_query or not assistant_response:
            return {
                "id": request_id,
                "success": False,
                "error": "Missing user_query or assistant_response"
            }

        try:
            memory_content = format_interaction_memory(user_query, assistant_response)
            metadata = build_interaction_metadata(memory_type, session_id)

            memory_id = await self.memory_store.add(
                memory_content,
                user_id,
                metadata,
                conversation_id=session_id,
                record_kind="interaction",
            )

            logger.info(f"Stored {memory_type} memory {memory_id} for user {user_id}")

            return {
                "id": request_id,
                "success": True,
                "data": {
                    "memory_id": memory_id,
                    "memory_type": memory_type,
                    "message": f"Stored {memory_type} memory"
                }
            }
        except Exception as e:
            logger.error(f"Memory store failed: {e}", exc_info=True)
            return {
                "id": request_id,
                "success": False,
                "error": f"Memory store failed: {str(e)}"
            }

    async def run(self) -> None:
        """Run the main event loop."""
        self.running = True
        logger.info("Starting memory service main loop...")

        try:
            while self.running:
                # Read JSON message from stdin (one line per message)
                try:
                    line = await asyncio.to_thread(sys.stdin.readline)
                except (OSError, ValueError):
                    if self._shutdown_requested or not self.running:
                        break
                    raise
                
                if not line:
                    # EOF - exit
                    break

                line = line.strip()
                if not line:
                    continue

                try:
                    # Parse JSON request
                    request = json.loads(line)
                    
                    # Handle request
                    response = await self.handle_request(request)
                    
                    # Send JSON response to stdout (one line)
                    write_json_line(response)
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON received: {e}")
                    error_response = {
                        "id": "unknown",
                        "success": False,
                        "error": f"Invalid JSON: {str(e)}"
                    }
                    write_json_line(error_response)
                except Exception as e:
                    logger.error(f"Error processing request: {e}", exc_info=True)
                    error_response = {
                        "id": request.get("id", "unknown") if 'request' in locals() else "unknown",
                        "success": False,
                        "error": str(e)
                    }
                    write_json_line(error_response)

        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        except Exception as e:
            logger.error(f"Error in main loop: {e}", exc_info=True)
        finally:
            await self.shutdown()

    def request_shutdown(self, signum: int | None = None) -> None:
        """Request graceful shutdown, optionally from a signal handler."""
        request_stdin_shutdown(self, logger, signum)

    async def shutdown(self) -> None:
        """Shutdown the service gracefully."""
        logger.info("Shutting down memory service...")
        self.running = False

        if self.memory_store:
            await self.memory_store.close()
            logger.info("Memory store closed")

        logger.info("Memory service shutdown complete")


def signal_handler(signum, frame):
    """Handle system signals for graceful shutdown."""
    if handle_shutdown_signal(signum, _active_service, logger):
        return
    raise KeyboardInterrupt


async def main():
    """Main entry point."""
    global _active_service
    # Set up signal handlers
    register_shutdown_signal_handlers(signal_handler)

    # Create and run the service
    service = MemoryService()
    _active_service = service

    try:
        await service.initialize()
        await service.run()
    except Exception as e:
        logger.error(f"Service failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        _active_service = None


if __name__ == "__main__":
    # Run the async main function
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Service terminated by user")
    except Exception as e:
        logger.error(f"Service crashed: {e}", exc_info=True)
        sys.exit(1)
