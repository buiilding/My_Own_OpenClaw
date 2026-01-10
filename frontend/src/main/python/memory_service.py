#!/usr/bin/env python3
"""
Minimal Python Memory Service

Handles only FAISS/memory operations with simple JSON protocol over stdin/stdout.
No tool execution, no system state capture.
"""

import asyncio
import json
import logging
import signal
import sys
from pathlib import Path
from typing import Any, Dict

# Add the frontend python directory to the path
frontend_python_dir = Path(__file__).parent
sys.path.insert(0, str(frontend_python_dir))

from memory.local_store import LocalMemoryStore

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr to avoid interfering with stdout protocol
)
logger = logging.getLogger(__name__)


class MemoryService:
    """
    Minimal memory service for FAISS operations only.
    Uses simple JSON request/response protocol over stdin/stdout.
    """

    def __init__(self):
        self.memory_store = None
        self.running = False

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
        request_id = request.get("id", "unknown")
        request_type = request.get("type")
        payload = request.get("payload", {})

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
            # Prepare filters
            filters = {}
            if memory_type:
                filters["type"] = memory_type

            # Search memory store
            results = await self.memory_store.search(query, user_id, filters, limit)

            # Group results by type for the backend
            memories = {"semantic": [], "episodic": []}
            for res in results:
                m_type = res.get("type", "episodic")
                text = res.get("text")
                if m_type in memories and text:
                    memories[m_type].append(text)

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
        user_query = payload.get("user_query")
        assistant_response = payload.get("assistant_response")
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
            # Format the interaction as a memory entry
            memory_content = f"User: {user_query}\nAssistant: {assistant_response}"

            metadata = {
                "type": memory_type,
                "source": "interaction_completed",
                "conversation_id": session_id
            }

            memory_id = await self.memory_store.add(
                memory_content,
                user_id,
                metadata,
                conversation_id=session_id
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
                line = await asyncio.to_thread(sys.stdin.readline)
                
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
                    response_json = json.dumps(response)
                    sys.stdout.write(response_json + "\n")
                    sys.stdout.flush()
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON received: {e}")
                    error_response = {
                        "id": "unknown",
                        "success": False,
                        "error": f"Invalid JSON: {str(e)}"
                    }
                    sys.stdout.write(json.dumps(error_response) + "\n")
                    sys.stdout.flush()
                except Exception as e:
                    logger.error(f"Error processing request: {e}", exc_info=True)
                    error_response = {
                        "id": request.get("id", "unknown") if 'request' in locals() else "unknown",
                        "success": False,
                        "error": str(e)
                    }
                    sys.stdout.write(json.dumps(error_response) + "\n")
                    sys.stdout.flush()

        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        except Exception as e:
            logger.error(f"Error in main loop: {e}", exc_info=True)
        finally:
            await self.shutdown()

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
    logger.info(f"Received signal {signum}")


async def main():
    """Main entry point."""
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Create and run the service
    service = MemoryService()

    try:
        await service.initialize()
        await service.run()
    except Exception as e:
        logger.error(f"Service failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    # Run the async main function
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Service terminated by user")
    except Exception as e:
        logger.error(f"Service crashed: {e}", exc_info=True)
        sys.exit(1)
