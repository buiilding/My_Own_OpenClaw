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
from pathlib import Path
from typing import Any, Dict, Optional

# Add the frontend python directory to the path
frontend_python_dir = Path(__file__).parent
sys.path.insert(0, str(frontend_python_dir))

from core.ipc_protocol import JSONRPCProtocol
from core.runtime_shutdown import (
    handle_shutdown_signal,
    register_shutdown_signal_handlers,
    request_stdin_shutdown,
)
from local_backend_memory_handlers import LocalBackendMemoryHandlersMixin
from memory.local_store import LocalMemoryStore
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


class LocalBackend(LocalBackendMemoryHandlersMixin):
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
