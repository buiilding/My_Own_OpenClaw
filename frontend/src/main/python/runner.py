#!/usr/bin/env python3
"""
Frontend Python Sidecar Runner

This is the main entry point for the Python sidecar process that runs
alongside the Electron frontend. It handles tool execution requests
via stdin/stdout communication.

Usage:
    python runner.py

The process expects JSON messages on stdin and sends responses on stdout.
"""

import asyncio
import logging
import signal
import sys
from pathlib import Path
from typing import Any, Dict, List

try:
    import aiosqlite
except ImportError:
    aiosqlite = None

# Add the frontend python directory to the path
frontend_python_dir = Path(__file__).parent
sys.path.insert(0, str(frontend_python_dir))

from core.protocol import FrontendProtocol
from core.dispatcher import ToolDispatcher

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr to avoid interfering with stdout protocol
)
logger = logging.getLogger(__name__)


class FrontendRunner:
    """
    Main runner class for the frontend Python sidecar.

    Handles the event loop and coordinates between the protocol and dispatcher.
    """

    def __init__(self):
        self.protocol = FrontendProtocol()
        self.dispatcher = None
        self.memory_store = None
        self.running = False
        self._catch_up_task = None  # Store reference to catch-up task

    async def initialize(self) -> None:
        """Initialize the runner and its components."""
        logger.info("Initializing frontend runner...")

        # Create tools directory path
        tools_dir = frontend_python_dir / "tools"

        # Initialize dispatcher
        self.dispatcher = ToolDispatcher(tools_dir)

        # Initialize memory store
        try:
            from memory.local_store import LocalMemoryStore
            self.memory_store = LocalMemoryStore()
            await self.memory_store.initialize()
            logger.info("Memory store initialized")
            
            # Run catch-up protocol: process any unprocessed memories from previous sessions
            # Wrap in safe handler to ensure errors don't prevent startup
            async def safe_catch_up():
                try:
                    logger.info("Catch-up semanticization task started")
                    await self._catch_up_semanticization()
                except Exception as e:
                    logger.error(f"Error in catch-up semanticization task: {e}", exc_info=True)
            
            # Create and schedule the task
            catch_up_task = asyncio.create_task(safe_catch_up())
            # Store reference to prevent garbage collection
            self._catch_up_task = catch_up_task
            logger.info("Catch-up semanticization task scheduled")
            # Give event loop a chance to start processing the task
            await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Failed to initialize memory store: {e}")

        # Log available tools
        available_tools = self.dispatcher.get_available_tools()
        logger.info(f"Loaded {len(available_tools)} tools: {list(available_tools.keys())}")

        # Send ready signal
        ready_message = self.protocol.create_response(
            "system",
            True,
            {"status": "ready", "tools": available_tools}
        )
        self.protocol.send_message(ready_message)

        logger.info("Frontend runner initialized successfully")
    
    async def _catch_up_semanticization(self) -> None:
        """
        Catch-Up Protocol: Process any unprocessed memories from previous sessions.
        
        Runs on application start to ensure no memories are left behind.
        This is completely non-blocking and runs in the background.
        """
        if not self.memory_store:
            logger.warning("Memory store not available for catch-up protocol")
            return
        
        try:
            logger.info("Running catch-up protocol for semanticization...")
            # No delay needed - memory store is already fully initialized before this task runs
            
            user_id = "default_user"  # TODO: Get from config or session
            
            # Get watermark state
            watermark = await self.memory_store.get_watermark()
            last_semanticized_id = watermark.get("last_semanticized_id")
            
            logger.info(
                f"Catch-up protocol: Checking for unprocessed memories "
                f"(watermark: {last_semanticized_id or 'none - will process all unprocessed'})"
            )
            
            # Debug: Check total unprocessed count
            try:
                async with aiosqlite.connect(self.memory_store.episodic_db_path) as conn:
                    cursor = await conn.cursor()
                    await cursor.execute(
                        "SELECT COUNT(*) FROM memories WHERE user_id = ? AND is_semanticized = 0",
                        (user_id,)
                    )
                    total_unprocessed = (await cursor.fetchone())[0]
                    logger.info(f"Debug: Total unprocessed episodic memories in DB: {total_unprocessed}")
            except Exception as e:
                logger.error(f"Debug: Failed to check unprocessed count: {e}", exc_info=True)
            
            # Get all unprocessed memories since watermark
            unprocessed = await self.memory_store.get_unprocessed_memories_after_id(
                last_semanticized_id, user_id, limit=1000
            )
            
            if not unprocessed:
                logger.info("Catch-up protocol: No unprocessed memories found")
                return
            
            logger.info(
                f"Catch-up protocol: Found {len(unprocessed)} unprocessed memories "
                f"(since watermark: {last_semanticized_id or 'beginning'})"
            )
            
            # Process the batch
            await self._process_semanticization_batch(unprocessed, user_id, is_catchup=True)
            
        except Exception as e:
            # Catch-all: ensure no exceptions propagate from background task
            logger.error(f"Error in catch-up semanticization: {e}", exc_info=True)
    
    async def _process_semanticization_batch(
        self, memories: List[Dict[str, Any]], user_id: str, is_catchup: bool = False
    ) -> None:
        """
        Process a batch of episodic memories into semantic memory.
        
        This is the core summarization routine used by both catch-up and batch protocols.
        It sends memories to the backend, stores semantic facts, and updates the watermark.
        
        IMPORTANT: On failure, the watermark is NOT updated, ensuring automatic retry.
        
        Args:
            memories: List of memory dictionaries to process
            user_id: User identifier
            is_catchup: Whether this is a catch-up operation (for logging)
        """
        if not self.memory_store or not memories:
            return
        
        try:
            # Extract conversation texts in chronological order
            conversations = [mem["content"] for mem in memories]
            memory_ids = [mem["id"] for mem in memories]
            conversation_ids = {mem.get("conversation_id") for mem in memories if mem.get("conversation_id")}
            
            context = "catch-up" if is_catchup else "batch"
            logger.info(
                f"Processing {context} semanticization: {len(memories)} memories "
                f"from {len(conversation_ids)} conversation(s)"
            )
            
            # Initialize LLM client
            from core.remote_llm_client import RemoteLLMClient
            llm_client = RemoteLLMClient()
            
            try:
                await llm_client.initialize()
            except Exception as e:
                logger.error(f"Failed to initialize LLM client for {context} semanticization: {e}", exc_info=True)
                # Don't update watermark on initialization failure - will retry
                return
            
            try:
                # Send request to backend (no timeout - wait for response)
                result = await llm_client.summarize_conversations(conversations, user_id)
                
                # When response arrives, store semantic facts
                if result.get("success") and result.get("facts"):
                    facts = result.get("facts", [])
                    summary = result.get("summary", "")
                    
                    try:
                        # Store each fact as a semantic memory
                        for fact in facts:
                            if fact.strip():
                                # Use first conversation_id if available, otherwise None
                                conversation_id = next(iter(conversation_ids)) if conversation_ids else None
                                
                                metadata = {
                                    "type": "semantic",
                                    "source": f"{context}_summarization",
                                    "summary": summary,
                                    "derived_from": memory_ids,
                                    "conversation_id": conversation_id
                                }
                                await self.memory_store.add(
                                    fact,
                                    user_id,
                                    metadata
                                )
                        
                        # Mark episodic memories as processed
                        await self.memory_store.mark_episodic_memories_semanticized(memory_ids)
                        
                        # Update watermark: set to the last processed memory ID
                        last_processed_id = memory_ids[-1] if memory_ids else None
                        await self.memory_store.update_watermark(last_processed_id, pending_message_count=0)
                        
                        logger.info(
                            f"Successfully processed {context} semanticization: "
                            f"{len(memory_ids)} memories → {len(facts)} semantic facts "
                            f"(watermark updated to: {last_processed_id})"
                        )
                    except Exception as e:
                        logger.error(f"Failed to store semantic facts in {context} processing: {e}", exc_info=True)
                        # Don't update watermark on storage failure - will retry
                else:
                    logger.warning(f"{context.capitalize()} semanticization returned no facts")
                    # Don't update watermark if no facts returned - will retry
                
            except Exception as e:
                logger.error(f"Summarization error in {context} processing: {e}", exc_info=True)
                # Don't update watermark on summarization failure - will retry
            finally:
                try:
                    await llm_client.close()
                except Exception as e:
                    logger.error(f"Error closing LLM client: {e}", exc_info=True)
        
        except Exception as e:
            # Catch-all: ensure no exceptions propagate
            logger.error(f"Unexpected error in {context} semanticization batch processing: {e}", exc_info=True)
            # Don't update watermark on unexpected errors - will retry
    
    async def _process_semantic_backlog(self) -> None:
        """
        DEPRECATED: This method is no longer used.
        Summarization is now stateless and triggered on episodic memory storage.
        """
        pass
    
    async def _check_periodic_summarization(
        self, user_id: str, conversation_id: str
    ) -> None:
        """
        DEPRECATED: Periodic summarization is no longer used.
        Summarization is now stateless and triggered on every episodic memory storage.
        """
        pass

    async def run(self) -> None:
        """Run the main event loop."""
        self.running = True
        logger.info("Starting frontend runner main loop...")

        try:
            while self.running:
                # Read message from stdin (non-blocking)
                # Use asyncio.to_thread to prevent blocking the event loop
                message = await asyncio.to_thread(self.protocol.receive_message)

                if message:
                    logger.debug(f"Received message: {message.type} ({message.id})")

                    # Handle the message
                    if message.type == "request":
                        # Dispatch to tool execution
                        await self.dispatcher.dispatch(message)
                    elif message.type == "system_state_request":
                        # Handle system state request
                        logger.info("Handling system state request")
                        from core.system_state import get_initial_state_xml, get_sequential_state_xml
                        
                        state_type = message.payload.get("context_type", "sequential")
                        if state_type == "initial":
                            xml = await get_initial_state_xml()
                        elif state_type == "sequential":
                            xml = await get_sequential_state_xml()
                        else:
                            # Fallback to sequential for unknown types (including legacy "full")
                            xml = await get_sequential_state_xml()
                            
                        response = self.protocol.create_response(
                            message.id,
                            True,
                            {"system_state": xml}
                        )
                        self.protocol.send_message(response)
                    elif message.type == "memory_search_request":
                        # Handle memory search request
                        logger.info("Handling memory search request")
                        query = message.payload.get("query")
                        user_id = message.payload.get("user_id", "default_user")
                        limit = message.payload.get("limit", 5)
                        
                        if not self.memory_store:
                            response = self.protocol.create_response(
                                message.id,
                                False,
                                error="Memory store not initialized"
                            )
                        else:
                            try:
                                results = await self.memory_store.search(query, user_id, limit=limit)
                                
                                logger.info(f"Memory search returned {len(results)} results for query: '{query}'")
                                if results:
                                    logger.debug(f"First result: {results[0]}")
                                
                                # Group results by type for the backend
                                memories = {"semantic": [], "episodic": []}
                                for res in results:
                                    m_type = res.get("type", "episodic")
                                    text = res.get("text")
                                    if m_type in memories and text:
                                        memories[m_type].append(text)
                                
                                logger.info(f"Grouped memories - episodic: {len(memories['episodic'])}, semantic: {len(memories['semantic'])}")
                                
                                response = self.protocol.create_response(
                                    message.id,
                                    True,
                                    {"memories": memories}
                                )
                            except Exception as e:
                                logger.error(f"Memory search failed: {e}")
                                response = self.protocol.create_response(
                                    message.id,
                                    False,
                                    error=f"Memory search failed: {str(e)}"
                                )
                        self.protocol.send_message(response)
                    elif message.type == "memory_store_request":
                        # Handle memory store request
                        logger.info("Handling memory store request")
                        user_query = message.payload.get("user_query")
                        assistant_response = message.payload.get("assistant_response")
                        memory_type = message.payload.get("memory_type", "episodic")
                        user_id = message.payload.get("user_id", "default_user")
                        session_id = message.payload.get("session_id")  # Track conversation window
                        
                        if not self.memory_store:
                            response = self.protocol.create_response(
                                message.id,
                                False,
                                error="Memory store not initialized"
                            )
                        elif not user_query or not assistant_response:
                            response = self.protocol.create_response(
                                message.id,
                                False,
                                error="Missing user_query or assistant_response"
                            )
                        else:
                            try:
                                # Format the interaction as a memory entry
                                # For episodic memory, store the full interaction
                                memory_content = f"User: {user_query}\nAssistant: {assistant_response}"
                                
                                metadata = {
                                    "type": memory_type,
                                    "source": "interaction_completed",
                                    "conversation_id": session_id  # Store conversation window ID
                                }
                                
                                memory_id = await self.memory_store.add(
                                    memory_content,
                                    user_id,
                                    metadata,
                                    conversation_id=session_id
                                )
                                
                                # Batch Protocol: If episodic memory, check if batch threshold reached
                                if memory_type == "episodic":
                                    # Increment pending count
                                    pending_count = await self.memory_store.increment_pending_count()
                                    
                                    # Check if batch threshold reached (20 messages)
                                    BATCH_THRESHOLD = 20
                                    if pending_count >= BATCH_THRESHOLD:
                                        logger.info(
                                            f"Batch threshold reached ({pending_count} messages). "
                                            "Triggering semanticization batch..."
                                        )
                                        # Fire-and-forget: process batch in background
                                        asyncio.create_task(
                                            self._process_pending_batch(user_id)
                                        )
                                
                                response = self.protocol.create_response(
                                    message.id,
                                    True,
                                    {
                                        "memory_id": memory_id,
                                        "memory_type": memory_type,
                                        "message": f"Stored {memory_type} memory"
                                    }
                                )
                                logger.info(f"Stored {memory_type} memory {memory_id} for user {user_id}")
                            except Exception as e:
                                logger.error(f"Memory store failed: {e}", exc_info=True)
                                response = self.protocol.create_response(
                                    message.id,
                                    False,
                                    error=f"Memory store failed: {str(e)}"
                                )
                        self.protocol.send_message(response)
                    elif message.type == "shutdown":
                        # Graceful shutdown
                        logger.info("Received shutdown signal")
                        self.running = False
                        break
                    else:
                        # Unknown message type
                        error_response = self.protocol.create_response(
                            message.id,
                            False,
                            error=f"Unknown message type: {message.type}"
                        )
                        self.protocol.send_message(error_response)
                else:
                    # No message available, small delay to prevent busy waiting
                    await asyncio.sleep(0.01)

        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        except Exception as e:
            logger.error(f"Error in main loop: {e}", exc_info=True)
        finally:
            await self.shutdown()

    async def shutdown(self) -> None:
        """Shutdown the runner gracefully."""
        logger.info("Shutting down frontend runner...")
        self.running = False

        if self.dispatcher:
            self.dispatcher.shutdown()

        from core.thread_pool import shutdown_executor
        shutdown_executor(wait=False)

        if self.memory_store:
            await self.memory_store.close()
            logger.info("Memory store closed")

        # Send shutdown confirmation
        shutdown_message = self.protocol.create_response(
            "system",
            True,
            {"status": "shutdown"}
        )
        self.protocol.send_message(shutdown_message)

        logger.info("Frontend runner shutdown complete")


def signal_handler(signum, frame):
    """Handle system signals for graceful shutdown."""
    logger.info(f"Received signal {signum}")
    # The asyncio loop will handle the shutdown
    pass


async def main():
    """Main entry point."""
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Create and run the runner
    runner = FrontendRunner()

    try:
        await runner.initialize()
        await runner.run()
    except Exception as e:
        logger.error(f"Runner failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    # Run the async main function
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Runner terminated by user")
    except Exception as e:
        logger.error(f"Runner crashed: {e}", exc_info=True)
        sys.exit(1)