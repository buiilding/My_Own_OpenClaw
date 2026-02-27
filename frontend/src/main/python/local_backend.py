#!/usr/bin/env python3
"""
Local Backend Service for Desktop Assistant.

Handles tool execution, system state collection, memory operations,
and wake-word detection. Communicates with Electron main process
via JSON-RPC 2.0 protocol over stdin/stdout.
"""

import asyncio
import logging
import os
import sys
from functools import wraps
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional

# Add the frontend python directory to the path
frontend_python_dir = Path(__file__).parent
sys.path.insert(0, str(frontend_python_dir))

from core.ipc_protocol import JSONRPCProtocol
from core.runtime_shutdown import (
    handle_shutdown_signal,
    register_shutdown_signal_handlers,
    request_stdin_shutdown,
)
from memory.local_store import LocalMemoryStore
from memory.operations import (
    build_store_memory_response_data,
    build_memory_filters,
    exclude_conversation_results,
    group_memory_texts,
    normalize_and_store_interaction_memory,
    normalize_search_memory_payload,
)
from memory.summarizer import MemorySummarizer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr to avoid interfering with stdout protocol
)
logger = logging.getLogger(__name__)
_active_backend: Optional["LocalBackend"] = None
ENV_ENABLE_SEMANTIC_SUMMARIZER = "WINDIE_ENABLE_SEMANTIC_SUMMARIZER"


def _env_flag_enabled(name: str, default: bool = True) -> bool:
    """Parse permissive boolean env flags (1/0, true/false, on/off, yes/no)."""
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"0", "false", "off", "no"}:
        return False
    if normalized in {"1", "true", "on", "yes"}:
        return True
    return default


def requires_memory_store(
    handler: Callable[..., Awaitable[Dict[str, Any]]],
) -> Callable[..., Awaitable[Dict[str, Any]]]:
    """Ensure memory handlers consistently fail when the store is unavailable."""

    @wraps(handler)
    async def wrapper(self: "LocalBackend", *args, **kwargs) -> Dict[str, Any]:
        if self.memory_store is None:
            return self._memory_store_not_initialized_response()
        return await handler(self, *args, **kwargs)

    return wrapper


class LocalBackend:
    """
    Main local backend service.
    
    Handles tool execution, system state, memory, and wake-word operations.
    """
    
    def __init__(self):
        self.protocol = JSONRPCProtocol()
        self.memory_store: LocalMemoryStore = None
        self._summarizer: Optional[MemorySummarizer] = None
        self._semantic_summarizer_enabled = _env_flag_enabled(
            ENV_ENABLE_SEMANTIC_SUMMARIZER,
            default=True,
        )
        self.running = False
        self._shutdown_requested = False
        # Initialize tool registry once (reused for all tool executions)
        from tools.registry import ToolRegistry
        self.tool_registry = ToolRegistry()
        self._initialize_methods()
    
    def _initialize_methods(self):
        """Register all JSON-RPC methods."""
        # Tool execution methods
        self.protocol.register_method("execute_tool", self._handle_execute_tool)
        
        # System state methods
        self.protocol.register_method("get_system_state", self._handle_get_system_state)
        
        # Memory methods
        self.protocol.register_method("search_memory", self._handle_search_memory)
        self.protocol.register_method("store_memory", self._handle_store_memory)
        self.protocol.register_method("search_conversations", self._handle_search_conversations)
        self.protocol.register_method("list_conversations", self._handle_list_conversations)
        self.protocol.register_method("list_episodic_memories", self._handle_list_episodic_memories)
        self.protocol.register_method("get_conversation", self._handle_get_conversation)
        self.protocol.register_method("list_semantic_memories", self._handle_list_semantic_memories)
        self.protocol.register_method("delete_episodic_memory", self._handle_delete_episodic_memory)
        self.protocol.register_method("delete_conversation", self._handle_delete_conversation)
        self.protocol.register_method("delete_semantic_memory", self._handle_delete_semantic_memory)
        self.protocol.register_method("store_transcript", self._handle_store_transcript)
        
        # Health check and diagnostics
        self.protocol.register_method("ping", self._handle_ping)
        self.protocol.register_method("get_status", self._handle_get_status)

    @staticmethod
    def _is_semantic_transcript_candidate(
        role: Optional[str],
        message_type: Optional[str],
    ) -> bool:
        """Return True when a transcript entry should be embedded/summarized."""
        normalized_role = (role or "").strip().lower()
        normalized_type = (message_type or "").strip().lower()

        if normalized_role == "user":
            return True

        if normalized_role == "assistant":
            return normalized_type in ("", "llm-text", "error")

        return False

    @staticmethod
    def _memory_store_not_initialized_response() -> Dict[str, Any]:
        """Canonical response shape for memory handlers when store is unavailable."""
        return {
            "success": False,
            "error": "Memory store not initialized",
        }

    async def _maybe_notify_summarizer(
        self,
        *,
        should_notify: bool,
        user_id: str,
    ) -> None:
        """
        Best-effort summarizer notification for new episodic interactions.

        Summarizer run gating now comes from DB counts, so this only nudges the
        active summarizer with user activity and never mutates watermark counters.
        """
        if not should_notify:
            return

        if self._summarizer is None:
            return

        try:
            self._summarizer.notify_new_memory(user_id)
        except Exception as e:
            logger.warning(f"Failed to notify summarizer about new interaction: {e}")
    
    async def initialize(self) -> None:
        """Initialize the backend services."""
        logger.info("Initializing local backend...")
        
        try:
            # Initialize memory store
            logger.info("Initializing memory store...")
            self.memory_store = LocalMemoryStore()
            await self.memory_store.initialize()
            logger.info("Memory store initialized")

            if self._semantic_summarizer_enabled:
                try:
                    self._summarizer = MemorySummarizer(self.memory_store)
                    await self._summarizer.start()
                    logger.info("Memory summarizer started")
                except Exception as e:
                    logger.error(f"Failed to start memory summarizer: {e}", exc_info=True)
            else:
                logger.info(
                    "Memory summarizer disabled via %s",
                    ENV_ENABLE_SEMANTIC_SUMMARIZER,
                )
            
            # Note: Wake-word detection is kept as separate subprocess for now
            # due to binary protocol requirements. Can be integrated later.
            
            logger.info("Local backend initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize local backend: {e}", exc_info=True)
            raise
    
    async def _handle_ping(self) -> Dict[str, Any]:
        """Health check method."""
        return {"status": "ok", "service": "local_backend"}
    
    async def _handle_get_status(self, **kwargs) -> Dict[str, Any]:
        """Get detailed backend status for diagnostics."""
        try:
            status = {
                "status": "ok",
                "service": "local_backend",
                "running": self.running,
                "memory_store_initialized": self.memory_store is not None,
                "tool_registry_initialized": hasattr(self, 'tool_registry') and self.tool_registry is not None,
                "semantic_summarizer_enabled": self._semantic_summarizer_enabled,
            }
            
            if self.tool_registry:
                status["registered_tools"] = list(self.tool_registry.tools.keys())
                status["tool_count"] = len(self.tool_registry.tools)
            
            if self.memory_store:
                try:
                    # Quick test to see if memory store is functional
                    status["memory_store_status"] = "operational"
                except Exception as e:
                    status["memory_store_status"] = f"error: {str(e)}"
            else:
                status["memory_store_status"] = "not_initialized"
            
            return status
        except Exception as e:
            logger.error(f"Status check failed: {e}", exc_info=True)
            return {
                "status": "error",
                "error": str(e)
            }
    
    async def _handle_execute_tool(self, tool_name: str, args: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """
        Execute a tool.
        
        Args:
            tool_name: Name of the tool to execute
            args: Tool arguments
        """
        try:
            result = await self.tool_registry.execute_tool(tool_name, args)
            # Convert ToolResult to dict for JSON-RPC response
            return result.to_dict()
        except Exception as e:
            logger.error(f"Tool execution error: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Tool execution failed: {str(e)}"
            }
    
    async def _handle_get_system_state(self, fields: Optional[list] = None, **kwargs) -> Dict[str, Any]:
        """Get system state with optional field selection."""
        try:
            from core.system_state import get_system_state
            
            state = await get_system_state(fields=fields)
            return {
                "success": True,
                "data": state
            }
        except Exception as e:
            logger.error(f"Failed to get system state: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    @requires_memory_store
    async def _handle_search_memory(
        self,
        query: str,
        user_id: str = "default_user",
        limit: int = 5,
        memory_type: str = None,
        exclude_conversation_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Search memory."""
        normalized, error = normalize_search_memory_payload(
            query=query,
            memory_type=memory_type,
        )
        if error:
            return {
                "success": False,
                "error": error,
            }

        query = normalized["query"]
        memory_type = normalized["memory_type"]
        try:
            filters = build_memory_filters(memory_type)
            results = await self.memory_store.search(query, user_id, filters, limit)
            filtered_results = exclude_conversation_results(results, exclude_conversation_id)
            memories = group_memory_texts(filtered_results)

            return {
                "success": True,
                "data": {
                    "memories": memories
                }
            }
        except Exception as e:
            logger.error(f"Memory search failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_search_conversations(
        self,
        query: str,
        user_id: str = "default_user",
        limit: int = 40,
        **kwargs,
    ) -> Dict[str, Any]:
        """Search transcript conversations by message content."""
        try:
            conversations = await self.memory_store.search_conversations(
                user_id=user_id,
                query=query,
                limit=limit,
            )
            return {
                "success": True,
                "data": {
                    "query": query,
                    "conversations": conversations,
                    "count": len(conversations),
                }
            }
        except Exception as e:
            logger.error(f"Conversation search failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_list_conversations(
        self,
        user_id: str = "default_user",
        limit: int = 200,
        record_kind: Optional[str] = "transcript",
        **kwargs,
    ) -> Dict[str, Any]:
        """List episodic conversation windows."""
        try:
            conversations = await self.memory_store.list_conversations(user_id, limit, record_kind)
            return {
                "success": True,
                "data": {
                    "conversations": conversations,
                    "count": len(conversations),
                }
            }
        except Exception as e:
            logger.error(f"Conversation listing failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_list_episodic_memories(
        self,
        user_id: str = "default_user",
        limit: int = 200,
        **kwargs,
    ) -> Dict[str, Any]:
        """List episodic memory entries excluding transcript conversation rows."""
        try:
            memories = await self.memory_store.list_episodic_memories(user_id, limit)
            return {
                "success": True,
                "data": {
                    "memories": memories,
                    "count": len(memories),
                }
            }
        except Exception as e:
            logger.error(f"Episodic memory listing failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_get_conversation(
        self,
        conversation_id: Optional[str] = None,
        user_id: str = "default_user",
        limit: int = 1000,
        record_kind: Optional[str] = "transcript",
        after_message_index: Optional[int] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Get episodic memories for a conversation window."""
        try:
            memories = await self.memory_store.get_episodic_memories_by_conversation(
                user_id,
                conversation_id,
                limit,
                record_kind=record_kind,
                after_message_index=after_message_index,
            )
            return {
                "success": True,
                "data": {
                    "conversation_id": conversation_id,
                    "memories": memories,
                    "count": len(memories),
                }
            }
        except Exception as e:
            logger.error(f"Conversation fetch failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_list_semantic_memories(
        self,
        user_id: str = "default_user",
        limit: int = 200,
        **kwargs,
    ) -> Dict[str, Any]:
        """List semantic memories for a user."""
        try:
            memories = await self.memory_store.list_semantic_memories(user_id, limit)
            return {
                "success": True,
                "data": {
                    "memories": memories,
                    "count": len(memories),
                }
            }
        except Exception as e:
            logger.error(f"Semantic memory listing failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_delete_episodic_memory(
        self,
        user_id: str = "default_user",
        memory_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete a non-transcript episodic memory entry."""
        if not memory_id:
            return {
                "success": False,
                "error": "memory_id is required"
            }

        try:
            deleted = await self.memory_store.delete_episodic_memory(
                user_id=user_id,
                memory_id=memory_id,
            )
            return {
                "success": True,
                "data": {
                    "memory_id": memory_id,
                    "deleted": bool(deleted),
                }
            }
        except Exception as e:
            logger.error(f"Episodic memory deletion failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_delete_conversation(
        self,
        user_id: str = "default_user",
        conversation_id: Optional[str] = None,
        record_kind: Optional[str] = "transcript",
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete episodic memories for a conversation window."""
        try:
            deleted_count = await self.memory_store.delete_conversation(
                user_id=user_id,
                conversation_id=conversation_id,
                record_kind=record_kind,
            )
            return {
                "success": True,
                "data": {
                    "conversation_id": conversation_id,
                    "record_kind": record_kind,
                    "deleted_count": deleted_count,
                }
            }
        except Exception as e:
            logger.error(f"Conversation deletion failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_delete_semantic_memory(
        self,
        user_id: str = "default_user",
        memory_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete a semantic memory entry."""
        if not memory_id:
            return {
                "success": False,
                "error": "memory_id is required"
            }

        try:
            deleted = await self.memory_store.delete_semantic_memory(
                user_id=user_id,
                memory_id=memory_id,
            )
            return {
                "success": True,
                "data": {
                    "memory_id": memory_id,
                    "deleted": bool(deleted),
                }
            }
        except Exception as e:
            logger.error(f"Semantic memory deletion failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_store_transcript(
        self,
        content: str,
        user_id: str = "default_user",
        conversation_ref: Optional[str] = None,
        session_id: Optional[str] = None,
        role: Optional[str] = None,
        message_type: Optional[str] = None,
        tool_name: Optional[str] = None,
        correlation_id: Optional[str] = None,
        message_index: Optional[int] = None,
        model_id: Optional[str] = None,
        model_provider: Optional[str] = None,
        screenshot: Optional[str] = None,
        timestamp: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Store a transcript entry with selective embeddings for recall/summarization."""
        if not content:
            return {
                "success": False,
                "error": "Content is required"
            }

        try:
            record_kind = "transcript"
            conversation_id = conversation_ref or session_id
            metadata = {
                "type": "episodic",
                "record_kind": record_kind,
            }
            if role:
                metadata["role"] = role
            if message_type:
                metadata["message_type"] = message_type
            if tool_name:
                metadata["tool_name"] = tool_name
            if correlation_id:
                metadata["correlation_id"] = correlation_id

            if message_index is None:
                message_index = await self.memory_store.get_next_message_index(
                    user_id, conversation_id
                )

            semantic_candidate = self._is_semantic_transcript_candidate(role, message_type)

            memory_id = await self.memory_store.add(
                content,
                user_id,
                metadata,
                conversation_id=conversation_id,
                record_kind=record_kind,
                role=role,
                message_index=message_index,
                message_type=message_type,
                tool_name=tool_name,
                correlation_id=correlation_id,
                model_id=model_id,
                model_provider=model_provider,
                screenshot=screenshot,
                skip_embedding=not semantic_candidate,
                timestamp=timestamp,
            )

            return {
                "success": True,
                "data": {
                    "memory_id": memory_id,
                    "message_index": message_index,
                    "record_kind": record_kind,
                    "semantic_candidate": semantic_candidate,
                }
            }
        except Exception as e:
            logger.error(f"Transcript store failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    @requires_memory_store
    async def _handle_store_memory(self, user_query: str, assistant_response: str, memory_type: str = "episodic", user_id: str = "default_user", session_id: str = None, **kwargs) -> Dict[str, Any]:
        """Store memory."""
        try:
            stored, error = await normalize_and_store_interaction_memory(
                self.memory_store,
                user_query=user_query,
                assistant_response=assistant_response,
                memory_type=memory_type,
                user_id=user_id,
                session_id=session_id,
            )
            if error:
                return {
                    "success": False,
                    "error": error,
                }

            memory_type = stored["memory_type"]
            await self._maybe_notify_summarizer(
                should_notify=(memory_type == "episodic"),
                user_id=user_id,
            )
            
            return {
                "success": True,
                "data": build_store_memory_response_data(
                    memory_id=stored["memory_id"],
                    memory_type=memory_type,
                ),
            }
        except Exception as e:
            logger.error(f"Memory store failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    async def run(self) -> None:
        """Run the main event loop."""
        self.running = True
        logger.info("Starting local backend main loop...")
        
        try:
            while self.running:
                # Read JSON-RPC message from stdin (one line per message)
                try:
                    line = await asyncio.to_thread(sys.stdin.readline)
                except (OSError, ValueError):
                    if self._shutdown_requested or not self.running:
                        break
                    raise
                
                if not line:
                    # EOF - exit
                    break
                
                # Process the line
                response = await self.protocol.process_line(line)
                
                if response:
                    self.protocol.send_response(response)
        
        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        except Exception as e:
            logger.error(f"Error in main loop: {e}", exc_info=True)
        finally:
            await self.shutdown()

    def request_shutdown(self, signum: Optional[int] = None) -> None:
        """Request graceful shutdown, optionally from a signal handler."""
        request_stdin_shutdown(self, logger, signum)
    
    async def shutdown(self) -> None:
        """Shutdown the service gracefully."""
        logger.info("Shutting down local backend...")
        self.running = False

        if self._summarizer:
            try:
                await self._summarizer.stop()
                logger.info("Memory summarizer stopped")
            except Exception as e:
                logger.warning(f"Failed to stop memory summarizer: {e}")

        if self.memory_store:
            await self.memory_store.close()
            logger.info("Memory store closed")
        
        logger.info("Local backend shutdown complete")


def signal_handler(signum, frame):
    """Handle system signals for graceful shutdown."""
    if handle_shutdown_signal(signum, _active_backend, logger):
        return
    raise KeyboardInterrupt


async def main():
    """Main entry point."""
    global _active_backend
    # Set up signal handlers
    register_shutdown_signal_handlers(signal_handler)
    
    # Create and run the service
    backend = LocalBackend()
    _active_backend = backend
    
    try:
        await backend.initialize()
        await backend.run()
    except Exception as e:
        logger.error(f"Service failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        _active_backend = None


if __name__ == "__main__":
    # Run the async main function
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Service terminated by user")
    except Exception as e:
        logger.error(f"Service crashed: {e}", exc_info=True)
        sys.exit(1)
