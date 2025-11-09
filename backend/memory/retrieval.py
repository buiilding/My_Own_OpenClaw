"""
Memory Retrieval System - Semantic search and temporal retrieval.

Provides advanced retrieval capabilities including semantic search,
temporal search, and hybrid search combining both approaches.
"""
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from backend.memory.local_store import LocalMemoryStore

logger = logging.getLogger(__name__)


class SemanticRetrieval:
    """
    Advanced memory retrieval system with semantic search and re-ranking.
    """

    def __init__(self, memory_store: LocalMemoryStore):
        """
        Initialize the retrieval system.

        Args:
            memory_store: LocalMemoryStore instance
        """
        self.memory_store = memory_store
        self.embedder = memory_store.embedder

    def semantic_search(
        self,
        query: str,
        user_id: str,
        memory_type: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search across memories.

        Args:
            query: Search query text
            user_id: User identifier
            memory_type: Optional filter by type ('episodic' or 'semantic')
            limit: Maximum number of results

        Returns:
            List of memory dictionaries with relevance scores
        """
        filters = {}
        if memory_type:
            filters["metadata.type"] = memory_type

        results = self.memory_store.search(
            query=query,
            user_id=user_id,
            filters=filters if filters else None,
            limit=limit * 2,  # Get more results for re-ranking
        )

        # Re-rank results
        if results:
            query_embedding = self.embedder.encode(query, convert_to_numpy=True)
            results = self._rerank_memories(query_embedding, results, query)

        return results[:limit]

    def temporal_search(
        self,
        user_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        memory_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Search memories within a specific time range.

        Args:
            user_id: User identifier
            start_time: Start of time range (defaults to 30 days ago)
            end_time: End of time range (defaults to now)
            memory_type: Optional filter by type
            limit: Maximum number of results

        Returns:
            List of memories sorted by timestamp (newest first)
        """
        if end_time is None:
            end_time = datetime.now()
        if start_time is None:
            start_time = end_time - timedelta(days=30)

        # Use a broad query to get all memories, then filter by time
        filters = {}
        if memory_type:
            filters["metadata.type"] = memory_type

        # Get more results than needed to filter by time
        results = self.memory_store.search(
            query="",  # Empty query returns all (sorted by recency)
            user_id=user_id,
            filters=filters if filters else None,
            limit=limit * 5,
        )

        # Filter by time range
        filtered_results = []
        for result in results:
            try:
                timestamp = datetime.fromisoformat(result["timestamp"])
                if start_time <= timestamp <= end_time:
                    filtered_results.append(result)
            except (ValueError, KeyError):
                continue

        # Sort by timestamp (newest first)
        filtered_results.sort(
            key=lambda x: datetime.fromisoformat(x["timestamp"]), reverse=True
        )

        return filtered_results[:limit]

    def hybrid_search(
        self, query: str, user_id: str, limit: int = 10, semantic_ratio: float = 0.7
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Combine semantic search with recent episodic memories.

        Args:
            query: Search query text
            user_id: User identifier
            limit: Maximum number of results per type
            semantic_ratio: Ratio of semantic to episodic results (0.0-1.0)

        Returns:
            Dictionary with 'semantic' and 'episodic' keys containing memory lists
        """
        # Get semantic memories
        semantic_limit = int(limit * semantic_ratio)
        semantic_results = self.semantic_search(
            query=query, user_id=user_id, memory_type="semantic", limit=semantic_limit
        )

        # Get recent episodic memories
        episodic_limit = limit - len(semantic_results)
        recent_episodic = self.temporal_search(
            user_id=user_id,
            start_time=datetime.now() - timedelta(days=7),  # Last 7 days
            memory_type="episodic",
            limit=episodic_limit,
        )

        return {"semantic": semantic_results, "episodic": recent_episodic}

    def _rerank_memories(
        self, query_embedding: np.ndarray, memories: List[Dict[str, Any]], query: str
    ) -> List[Dict[str, Any]]:
        """
        Re-rank memories by relevance, recency, and importance.

        Args:
            query_embedding: Query embedding vector
            memories: List of memory dictionaries
            query: Original query text

        Returns:
            Re-ranked list of memories
        """
        if not memories:
            return memories

        now = datetime.now()
        scored_memories = []

        for memory in memories:
            # Base semantic similarity score (already in memory['score'])
            similarity_score = memory.get("score", 0.0)

            # Recency boost (newer memories get slight boost)
            try:
                timestamp = datetime.fromisoformat(memory["timestamp"])
                hours_old = (now - timestamp).total_seconds() / 3600
                # Decay over 30 days
                recency_score = max(0.0, 1.0 - (hours_old / (24 * 30)))
            except (ValueError, KeyError):
                recency_score = 0.5  # Default for missing timestamp

            # Importance score from metadata
            metadata = memory.get("metadata", {})
            importance = metadata.get("importance", 0.5)
            if not isinstance(importance, (int, float)):
                importance = 0.5

            # Final score combines all factors
            final_score = (
                similarity_score * 0.7
                + recency_score * 0.2  # Semantic similarity (70%)
                + importance * 0.1  # Recency (20%)  # Importance (10%)
            )

            scored_memories.append((final_score, memory))

        # Sort by final score (descending)
        scored_memories.sort(key=lambda x: x[0], reverse=True)

        # Update scores in memory dicts
        for final_score, memory in scored_memories:
            memory["score"] = final_score

        return [memory for _, memory in scored_memories]
