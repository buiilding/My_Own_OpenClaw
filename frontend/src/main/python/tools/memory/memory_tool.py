"""
Frontend Memory Tool

Tool for managing episodic and semantic memory using the local memory store.
"""

import logging
from typing import Dict, Any, List, Optional

from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult
from memory.local_store import LocalMemoryStore

logger = logging.getLogger(__name__)

MemoryType = str  # "episodic" or "semantic"


class AddMemoryArgs(BaseModel):
    """Arguments for adding memory."""
    content: str = Field(..., description="The content to store in memory")
    memory_type: MemoryType = Field("episodic", description="Type of memory: 'episodic' or 'semantic'")
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class SearchMemoryArgs(BaseModel):
    """Arguments for searching memory."""
    query: str = Field(..., description="Search query to find relevant memories")
    memory_type: Optional[MemoryType] = Field(None, description="Optional filter by memory type")
    limit: int = Field(10, description="Maximum number of results to return")
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class MemoryTool(FrontendTool):
    """
    Memory management tool for storing and retrieving episodic and semantic memories.

    This tool provides access to the local memory system with remote embeddings.
    """

    name = "memory"
    description = "Manage episodic and semantic memory: store new memories, search existing ones, and retrieve relevant information."

    def __init__(self):
        self._memory_store: Optional[LocalMemoryStore] = None

    async def initialize(self) -> bool:
        """Initialize the memory store."""
        if self._memory_store is None:
            try:
                self._memory_store = LocalMemoryStore()
                await self._memory_store.initialize()
                logger.info("Memory tool initialized")
                return True
            except Exception as e:
                logger.error(f"Failed to initialize memory store: {e}")
                return False
        return True

    async def run(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute memory operations.

        Args:
            args: Arguments dictionary containing the operation and parameters

        Returns:
            Result dictionary with operation results
        """
        try:
            # Ensure initialized
            if not await self.initialize():
                return SimpleToolResult.failure("Memory tool initialization failed").to_dict()

            # Extract operation from args
            operation = args.get("operation", "search")  # default to search

            if operation == "add":
                return await self._add_memory(args)
            elif operation == "search":
                return await self._search_memory(args)
            elif operation == "stats":
                return await self._get_stats()
            else:
                return SimpleToolResult.failure(f"Unknown memory operation: {operation}").to_dict()

        except Exception as e:
            logger.error(f"Memory tool error: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Memory operation failed: {str(e)}").to_dict()

    async def _add_memory(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Add a new memory entry."""
        try:
            content = args.get("content")
            memory_type = args.get("memory_type", "episodic")
            user_id = args.get("user_id", "default_user")

            if not content:
                return SimpleToolResult.failure("Content is required for adding memory").to_dict()

            # Prepare metadata
            metadata = {"type": memory_type}

            # Add to memory store
            memory_id = await self._memory_store.add(content, user_id, metadata)

            return {
                "success": True,
                "data": {
                    "memory_id": memory_id,
                    "content": content,
                    "memory_type": memory_type,
                    "message": f"Added {memory_type} memory: {content[:50]}{'...' if len(content) > 50 else ''}",
                    "llm_content": f"Stored in {memory_type} memory",
                    "return_display": f"Memory added ({memory_type})"
                }
            }

        except Exception as e:
            logger.error(f"Error adding memory: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Failed to add memory: {str(e)}").to_dict()

    async def _search_memory(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Search for memories."""
        try:
            query = args.get("query")
            memory_type = args.get("memory_type")
            limit = args.get("limit", 10)
            user_id = args.get("user_id", "default_user")

            if not query:
                return SimpleToolResult.failure("Query is required for searching memory").to_dict()

            # Prepare filters
            filters = {}
            if memory_type:
                filters["type"] = memory_type

            # Search memory store
            results = await self._memory_store.search(query, user_id, filters, limit)

            # Format results for LLM
            formatted_results = []
            for result in results:
                formatted_results.append({
                    "id": result["id"],
                    "content": result["text"],
                    "type": result["type"],
                    "score": result["score"],
                    "timestamp": result["timestamp"]
                })

            summary = f"Found {len(results)} relevant memories"

            return {
                "success": True,
                "data": {
                    "query": query,
                    "results": formatted_results,
                    "count": len(results),
                    "llm_content": summary,
                    "return_display": f"Memory search results: {len(results)} matches",
                    "formatted_results": "\n".join([
                        f"- {r['type'].title()}: {r['content'][:100]}{'...' if len(r['content']) > 100 else ''} (score: {r['score']:.3f})"
                        for r in results[:5]  # Show first 5 results
                    ])
                }
            }

        except Exception as e:
            logger.error(f"Error searching memory: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Failed to search memory: {str(e)}").to_dict()

    async def _get_stats(self) -> Dict[str, Any]:
        """Get memory statistics."""
        try:
            user_id = "default_user"  # Could be parameterized
            stats = await self._memory_store.get_stats(user_id)

            return {
                "success": True,
                "data": {
                    "stats": stats,
                    "llm_content": f"Memory contains {stats['total_count']} total memories ({stats['by_type']['episodic']} episodic, {stats['by_type']['semantic']} semantic)",
                    "return_display": f"Memory stats: {stats['total_count']} memories"
                }
            }

        except Exception as e:
            logger.error(f"Error getting memory stats: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Failed to get memory stats: {str(e)}").to_dict()

    async def close(self) -> None:
        """Close the memory store."""
        if self._memory_store:
            await self._memory_store.close()