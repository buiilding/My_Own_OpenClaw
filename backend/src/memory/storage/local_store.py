"""
Local Memory Store - SQLite + FAISS implementation for local memory storage.

This module provides a complete local implementation of Mem0 functionality
with zero external API dependencies. All embeddings are generated locally
and all data is stored on the user's device.

Uses aiosqlite for async database operations.
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import aiosqlite
except ImportError:
    aiosqlite = None

try:
    import faiss
except ImportError:
    faiss = None

from backend.src.core.config import get_config_dir
from backend.src.core.interfaces.embedding import EmbeddingProvider

logger = logging.getLogger(__name__)


class LocalMemoryStore:
    """
    Local memory storage using separate SQLite databases for episodic and semantic memory.
    Each memory type has its own database and FAISS index for efficient storage and retrieval.
    All database operations are async using aiosqlite.
    """

    def __init__(self, embedder: EmbeddingProvider, db_path: Optional[str] = None):
        """
        Initialize the local memory store with separate databases for each memory type.

        Args:
            embedder: EmbeddingProvider instance
            db_path: Base directory path for databases (defaults to config_dir/memory/)
                     If None, uses default config directory. If a file path is provided,
                     uses its parent directory. If a directory path is provided, uses it directly.
        """
        # Determine memory directory
        if db_path is None:
            config_dir = get_config_dir()
            memory_dir = config_dir / "memory"
        else:
            db_path_obj = Path(db_path)
            # If it's a file path (has extension), use parent directory
            # Otherwise, treat as directory
            if db_path_obj.suffix:
                memory_dir = db_path_obj.parent
            else:
                memory_dir = db_path_obj
        
        memory_dir.mkdir(parents=True, exist_ok=True)

        self.memory_dir = memory_dir
        self.embedder = embedder

        # Separate database paths for each memory type
        self.episodic_db_path = str(memory_dir / "episodic.db")
        self.semantic_db_path = str(memory_dir / "semantic.db")

        # Separate FAISS indices for each memory type
        self.episodic_index_path = memory_dir / "episodic.faiss.index"
        self.semantic_index_path = memory_dir / "semantic.faiss.index"

        # Separate vector ID mappings for each memory type
        self.episodic_vector_id_to_memory_id: Dict[int, str] = {}
        self.episodic_memory_id_to_vector_id: Dict[str, int] = {}
        self.episodic_next_vector_id = 0

        self.semantic_vector_id_to_memory_id: Dict[int, str] = {}
        self.semantic_memory_id_to_vector_id: Dict[str, int] = {}
        self.semantic_next_vector_id = 0

        if faiss is None:
            raise ImportError(
                "FAISS is not installed. Install with: pip install faiss-cpu"
            )

        if aiosqlite is None:
            raise ImportError(
                "aiosqlite is not installed. Install with: pip install aiosqlite"
            )

        # Load or create FAISS indices
        if self.episodic_index_path.exists():
            self.episodic_index = faiss.read_index(str(self.episodic_index_path))
        else:
            self.episodic_index = faiss.IndexFlatIP(self.embedder.dimension)

        if self.semantic_index_path.exists():
            self.semantic_index = faiss.read_index(str(self.semantic_index_path))
        else:
            self.semantic_index = faiss.IndexFlatIP(self.embedder.dimension)

    async def initialize(self) -> None:
        """
        Async initialization: create database schemas and load vector mappings.
        Call this after instantiation to complete setup.
        """
        await self._init_databases()
        await self._load_vector_mappings()
        await self._sync_vector_mappings()

    async def _init_databases(self) -> None:
        """Initialize SQLite database schemas for both memory types."""
        # Initialize episodic memory database
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()

            await cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    metadata TEXT,
                    embedding_id INTEGER,
                    created_at REAL DEFAULT (strftime('%s', 'now'))
                )
            """
            )

            await cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_user_id
                ON memories(user_id)
            """
            )

            await cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_timestamp
                ON memories(timestamp)
            """
            )

            await cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_embedding_id
                ON memories(embedding_id)
            """
            )

            await conn.commit()

        # Initialize semantic memory database (same schema)
        async with aiosqlite.connect(self.semantic_db_path) as conn:
            cursor = await conn.cursor()

            await cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    metadata TEXT,
                    embedding_id INTEGER,
                    created_at REAL DEFAULT (strftime('%s', 'now'))
                )
            """
            )

            await cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_user_id
                ON memories(user_id)
            """
            )

            await cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_timestamp
                ON memories(timestamp)
            """
            )

            await cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_embedding_id
                ON memories(embedding_id)
            """
            )

            await conn.commit()

    async def _load_vector_mappings(self) -> None:
        """Load vector ID to memory ID mappings from both databases."""
        # Load episodic mappings
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id, embedding_id FROM memories
                WHERE embedding_id IS NOT NULL
            """
            )

            rows = await cursor.fetchall()
            for memory_id, vector_id in rows:
                self.episodic_vector_id_to_memory_id[vector_id] = memory_id
                self.episodic_memory_id_to_vector_id[memory_id] = vector_id
                if vector_id >= self.episodic_next_vector_id:
                    self.episodic_next_vector_id = vector_id + 1

        # Load semantic mappings
        async with aiosqlite.connect(self.semantic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id, embedding_id FROM memories
                WHERE embedding_id IS NOT NULL
            """
            )

            rows = await cursor.fetchall()
            for memory_id, vector_id in rows:
                self.semantic_vector_id_to_memory_id[vector_id] = memory_id
                self.semantic_memory_id_to_vector_id[memory_id] = vector_id
                if vector_id >= self.semantic_next_vector_id:
                    self.semantic_next_vector_id = vector_id + 1

    async def _sync_vector_mappings(self) -> None:
        """Sync vector mappings: ensure all memories in both DBs have vector IDs."""
        # Sync episodic mappings
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id FROM memories
                WHERE embedding_id IS NULL
            """
            )

            rows = await cursor.fetchall()
            missing_ids = [row[0] for row in rows]

            for memory_id in missing_ids:
                await cursor.execute(
                    "SELECT content FROM memories WHERE id = ?", (memory_id,)
                )
                row = await cursor.fetchone()
                if row:
                    content = row[0]
                    embedding = self.embedder.embed_text(content)
                    embedding = embedding.reshape(1, -1)
                    faiss.normalize_L2(embedding)

                    vector_id = self.episodic_next_vector_id
                    self.episodic_index.add(embedding)

                    await cursor.execute(
                        """
                        UPDATE memories SET embedding_id = ? WHERE id = ?
                    """,
                        (vector_id, memory_id),
                    )

                    self.episodic_vector_id_to_memory_id[vector_id] = memory_id
                    self.episodic_memory_id_to_vector_id[memory_id] = vector_id
                    self.episodic_next_vector_id += 1

            await conn.commit()

        # Sync semantic mappings
        async with aiosqlite.connect(self.semantic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id FROM memories
                WHERE embedding_id IS NULL
            """
            )

            rows = await cursor.fetchall()
            missing_ids = [row[0] for row in rows]

            for memory_id in missing_ids:
                await cursor.execute(
                    "SELECT content FROM memories WHERE id = ?", (memory_id,)
                )
                row = await cursor.fetchone()
                if row:
                    content = row[0]
                    embedding = self.embedder.embed_text(content)
                    embedding = embedding.reshape(1, -1)
                    faiss.normalize_L2(embedding)

                    vector_id = self.semantic_next_vector_id
                    self.semantic_index.add(embedding)

                    await cursor.execute(
                        """
                        UPDATE memories SET embedding_id = ? WHERE id = ?
                    """,
                        (vector_id, memory_id),
                    )

                    self.semantic_vector_id_to_memory_id[vector_id] = memory_id
                    self.semantic_memory_id_to_vector_id[memory_id] = vector_id
                    self.semantic_next_vector_id += 1

            await conn.commit()

        # Save FAISS indices
        self._save_faiss_indices()

    def _save_faiss_indices(self) -> None:
        """Save both FAISS indices to disk (sync operation)."""
        try:
            faiss.write_index(self.episodic_index, str(self.episodic_index_path))
            faiss.write_index(self.semantic_index, str(self.semantic_index_path))
        except Exception as e:
            logger.error(f"Failed to save FAISS indices: {e}")

    async def add(
        self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Store a memory entry with automatic embedding generation.
        Routes to the appropriate database based on memory type.

        Args:
            text: Content to store
            user_id: User identifier
            metadata: Optional metadata dictionary (must include "type": "episodic" or "semantic")

        Returns:
            Memory ID string
        """
        memory_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()

        # Extract memory type from metadata (default to episodic for backward compatibility)
        memory_type = metadata.get("type", "episodic") if metadata else "episodic"

        if memory_type not in ("episodic", "semantic"):
            raise ValueError(f"Invalid memory type: {memory_type}. Must be 'episodic' or 'semantic'")

        # Generate embedding
        embedding = self.embedder.embed_text(text)
        embedding = embedding.reshape(1, -1)
        faiss.normalize_L2(embedding)

        # Route to appropriate database and index
        if memory_type == "episodic":
            db_path = self.episodic_db_path
            index = self.episodic_index
            vector_id = self.episodic_next_vector_id
            vector_id_to_memory_id = self.episodic_vector_id_to_memory_id
            memory_id_to_vector_id = self.episodic_memory_id_to_vector_id
            self.episodic_next_vector_id += 1
        else:  # semantic
            db_path = self.semantic_db_path
            index = self.semantic_index
            vector_id = self.semantic_next_vector_id
            vector_id_to_memory_id = self.semantic_vector_id_to_memory_id
            memory_id_to_vector_id = self.semantic_memory_id_to_vector_id
            self.semantic_next_vector_id += 1

        # Add to FAISS index
        index.add(embedding)

        # Store in SQLite
        metadata_json = json.dumps(metadata) if metadata else None

        async with aiosqlite.connect(db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                INSERT INTO memories
                (id, user_id, content, timestamp, metadata, embedding_id)
                VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    memory_id,
                    user_id,
                    text,
                    timestamp,
                    metadata_json,
                    vector_id,
                ),
            )
            await conn.commit()

        # Update mappings
        vector_id_to_memory_id[vector_id] = memory_id
        memory_id_to_vector_id[memory_id] = vector_id

        # Save FAISS indices periodically (every 10 additions)
        total_additions = self.episodic_next_vector_id + self.semantic_next_vector_id
        if total_additions % 10 == 0:
            self._save_faiss_indices()

        logger.debug(f"Stored {memory_type} memory {memory_id} for user {user_id}")
        return memory_id

    async def search(
        self,
        query: str,
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Search memories using semantic similarity with optional metadata filtering.
        Searches both episodic and semantic databases and combines results.

        Args:
            query: Search query text
            user_id: User identifier
            filters: Optional metadata filters (e.g., {"metadata.type": "episodic"})
                     Note: type filter is now handled by searching appropriate database(s)
            limit: Maximum number of results

        Returns:
            List of memory dictionaries with 'id', 'text', 'metadata', 'score' keys
        """
        # Determine which databases to search based on filters
        search_episodic = True
        search_semantic = True
        
        if filters:
            # Check if type filter is specified
            memory_type_filter = None
            if "metadata.type" in filters:
                memory_type_filter = filters["metadata.type"]
            elif "type" in filters:
                memory_type_filter = filters["type"]
            
            if memory_type_filter == "episodic":
                search_semantic = False
            elif memory_type_filter == "semantic":
                search_episodic = False

        # Generate query embedding
        query_embedding = self.embedder.embed_text(query)
        query_embedding = query_embedding.reshape(1, -1)
        faiss.normalize_L2(query_embedding)

        # Search both databases in parallel
        search_tasks = []
        
        if search_episodic:
            search_tasks.append(
                self._search_database(
                    query_embedding=query_embedding,
                    user_id=user_id,
                    db_path=self.episodic_db_path,
                    index=self.episodic_index,
                    vector_id_to_memory_id=self.episodic_vector_id_to_memory_id,
                    memory_type="episodic",
                    filters=filters,
                    limit=limit,
                )
            )

        if search_semantic:
            search_tasks.append(
                self._search_database(
                    query_embedding=query_embedding,
                    user_id=user_id,
                    db_path=self.semantic_db_path,
                    index=self.semantic_index,
                    vector_id_to_memory_id=self.semantic_vector_id_to_memory_id,
                    memory_type="semantic",
                    filters=filters,
                    limit=limit,
                )
            )

        # Execute searches concurrently
        if search_tasks:
            results_lists = await asyncio.gather(*search_tasks)
            all_results = []
            for results in results_lists:
                all_results.extend(results)
        else:
            all_results = []

        # Sort all results by score (descending) and limit
        all_results.sort(key=lambda x: x["score"], reverse=True)
        return all_results[:limit]

    async def _search_database(
        self,
        query_embedding,
        user_id: str,
        db_path: str,
        index,
        vector_id_to_memory_id: Dict[int, str],
        memory_type: str,
        filters: Optional[Dict[str, Any]],
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Helper method to search a specific database."""
        # Search FAISS index
        k = min(limit * 3, index.ntotal) if index.ntotal > 0 else limit
        if k == 0:
            return []

        similarities, indices = index.search(query_embedding, k)

        results = []
        if not indices[0].size:
            return results

        # Filter indices that exist in mapping
        valid_indices = []
        valid_similarities = []
        for sim, idx in zip(similarities[0], indices[0]):
            if idx in vector_id_to_memory_id:
                valid_indices.append(idx)
                valid_similarities.append(sim)

        if not valid_indices:
            return results

        # Get memory IDs
        memory_ids = [vector_id_to_memory_id[idx] for idx in valid_indices]

        # Batch retrieval from SQLite
        async with aiosqlite.connect(db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()

            placeholders = ",".join(["?"] * len(memory_ids))
            query = f"""
                SELECT id, user_id, content, timestamp, metadata
                FROM memories WHERE id IN ({placeholders})
            """

            await cursor.execute(query, memory_ids)
            rows = await cursor.fetchall()

            # Create a lookup map for O(1) access
            rows_map = {row["id"]: row for row in rows}

            # Reconstruct results in order of similarity
            for memory_id, similarity in zip(memory_ids, valid_similarities):
                row = rows_map.get(memory_id)
                if not row:
                    continue

                # Apply user_id filter
                if row["user_id"] != user_id:
                    continue

                # Parse metadata
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                # Ensure type is set in metadata
                metadata["type"] = memory_type

                # Apply metadata filters (excluding type filter as it's already handled)
                if filters:
                    filtered_filters = {
                        k: v for k, v in filters.items()
                        if k not in ("metadata.type", "type")
                    }
                    if filtered_filters and not self._matches_filters(metadata, filtered_filters):
                        continue

                results.append(
                    {
                        "id": row["id"],
                        "text": row["content"],
                        "metadata": metadata,
                        "score": float(similarity),
                        "timestamp": row["timestamp"],
                        "type": memory_type,
                    }
                )

        return results

    def _matches_filters(
        self, metadata: Dict[str, Any], filters: Dict[str, Any]
    ) -> bool:
        """
        Check if metadata matches filter criteria.

        Args:
            metadata: Memory metadata dictionary
            filters: Filter dictionary (e.g., {"metadata.type": "episodic"})

        Returns:
            True if metadata matches all filters
        """
        for filter_key, filter_value in filters.items():
            # Handle nested keys like "metadata.type"
            if filter_key.startswith("metadata."):
                key = filter_key.replace("metadata.", "")
                if key not in metadata or metadata[key] != filter_value:
                    return False
            else:
                if filter_key not in metadata or metadata[filter_key] != filter_value:
                    return False

        return True

    async def update(
        self, memory_id: str, metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Update memory metadata. Searches both databases to find the memory.

        Args:
            memory_id: Memory ID to update
            metadata: New metadata dictionary (merged with existing)

        Returns:
            True if update successful, False otherwise
        """
        # Try episodic database first
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                "SELECT metadata FROM memories WHERE id = ?", (memory_id,)
            )
            row = await cursor.fetchone()

            if row:
                # Found in episodic database
                existing_metadata = json.loads(row[0]) if row[0] else {}
                if metadata:
                    existing_metadata.update(metadata)

                await cursor.execute(
                    """
                    UPDATE memories SET metadata = ? WHERE id = ?
                """,
                    (json.dumps(existing_metadata), memory_id),
                )
                await conn.commit()
                logger.debug(f"Updated episodic memory {memory_id}")
                return True

        # Try semantic database
        async with aiosqlite.connect(self.semantic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                "SELECT metadata FROM memories WHERE id = ?", (memory_id,)
            )
            row = await cursor.fetchone()

            if row:
                # Found in semantic database
                existing_metadata = json.loads(row[0]) if row[0] else {}
                if metadata:
                    existing_metadata.update(metadata)

                await cursor.execute(
                    """
                    UPDATE memories SET metadata = ? WHERE id = ?
                """,
                    (json.dumps(existing_metadata), memory_id),
                )
                await conn.commit()
                logger.debug(f"Updated semantic memory {memory_id}")
                return True

        return False

    async def delete(self, memory_id: str) -> bool:
        """
        Delete a memory entry. Searches both databases to find and delete the memory.

        Args:
            memory_id: Memory ID to delete

        Returns:
            True if deletion successful, False otherwise
        """
        # Try episodic database first
        vector_id = self.episodic_memory_id_to_vector_id.get(memory_id)
        if vector_id is not None:
            async with aiosqlite.connect(self.episodic_db_path) as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
                deleted = cursor.rowcount > 0
                await conn.commit()

            if deleted:
                self.episodic_vector_id_to_memory_id.pop(vector_id, None)
                self.episodic_memory_id_to_vector_id.pop(memory_id, None)
                logger.debug(f"Deleted episodic memory {memory_id}")
                return True

        # Try semantic database
        vector_id = self.semantic_memory_id_to_vector_id.get(memory_id)
        if vector_id is not None:
            async with aiosqlite.connect(self.semantic_db_path) as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
                deleted = cursor.rowcount > 0
                await conn.commit()

            if deleted:
                self.semantic_vector_id_to_memory_id.pop(vector_id, None)
                self.semantic_memory_id_to_vector_id.pop(memory_id, None)
                logger.debug(f"Deleted semantic memory {memory_id}")
                return True

        return False

    async def get_by_filters(
        self,
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 1000,
        order_by: str = "timestamp",
        order_desc: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Get memories by filters without using vector search.
        Searches both databases and combines results.

        Args:
            user_id: User identifier
            filters: Optional metadata filters (e.g., {"metadata.type": "episodic"})
            limit: Maximum number of results
            order_by: Column to order by (default: "timestamp")
            order_desc: Whether to order descending (default: True)

        Returns:
            List of memory dictionaries with 'id', 'text', 'metadata', 'timestamp', 'type' keys
        """
        # Determine which databases to search
        search_episodic = True
        search_semantic = True

        if filters:
            memory_type_filter = None
            if "metadata.type" in filters:
                memory_type_filter = filters["metadata.type"]
            elif "type" in filters:
                memory_type_filter = filters["type"]

            if memory_type_filter == "episodic":
                search_semantic = False
            elif memory_type_filter == "semantic":
                search_episodic = False

        # Search both databases in parallel
        search_tasks = []

        if search_episodic:
            search_tasks.append(
                self._get_by_filters_from_db(
                    user_id=user_id,
                    db_path=self.episodic_db_path,
                    memory_type="episodic",
                    filters=filters,
                )
            )

        if search_semantic:
            search_tasks.append(
                self._get_by_filters_from_db(
                    user_id=user_id,
                    db_path=self.semantic_db_path,
                    memory_type="semantic",
                    filters=filters,
                )
            )

        # Execute searches concurrently
        if search_tasks:
            results_lists = await asyncio.gather(*search_tasks)
            results = []
            for results_list in results_lists:
                results.extend(results_list)
        else:
            results = []

        # Sort results
        reverse = order_desc
        if order_by == "timestamp":
            results.sort(key=lambda x: x.get("timestamp", ""), reverse=reverse)
        elif order_by == "created_at":
            results.sort(key=lambda x: x.get("timestamp", ""), reverse=reverse)

        # Apply limit
        return results[:limit]

    async def _get_by_filters_from_db(
        self,
        user_id: str,
        db_path: str,
        memory_type: str,
        filters: Optional[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Helper method to get memories by filters from a specific database."""
        results = []
        async with aiosqlite.connect(db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()

            query = "SELECT id, user_id, content, timestamp, metadata FROM memories WHERE user_id = ?"
            params = [user_id]

            await cursor.execute(query, params)
            rows = await cursor.fetchall()

            for row in rows:
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                metadata["type"] = memory_type

                # Apply metadata filters (excluding type filter)
                if filters:
                    filtered_filters = {
                        k: v for k, v in filters.items()
                        if k not in ("metadata.type", "type")
                    }
                    if filtered_filters and not self._matches_filters(metadata, filtered_filters):
                        continue

                results.append(
                    {
                        "id": row["id"],
                        "text": row["content"],
                        "metadata": metadata,
                        "timestamp": row["timestamp"],
                        "type": memory_type,
                    }
                )

        return results

    async def get_in_time_range(
        self,
        user_id: str,
        start_time: datetime,
        end_time: datetime,
        memory_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Get memories created within a specific time range.
        Searches appropriate database(s) based on memory_type filter.

        Args:
            user_id: User identifier
            start_time: Start datetime (inclusive)
            end_time: End datetime (inclusive)
            memory_type: Optional filter by memory type ("episodic" or "semantic")
            limit: Maximum number of results

        Returns:
            List of memory dictionaries sorted by timestamp (newest first)
        """
        start_iso = start_time.isoformat()
        end_iso = end_time.isoformat()

        # Determine which databases to search
        search_episodic = memory_type is None or memory_type == "episodic"
        search_semantic = memory_type is None or memory_type == "semantic"

        # Search both databases in parallel
        search_tasks = []

        if search_episodic:
            search_tasks.append(
                self._get_in_time_range_from_db(
                    user_id=user_id,
                    db_path=self.episodic_db_path,
                    start_iso=start_iso,
                    end_iso=end_iso,
                    memory_type="episodic",
                    limit=limit,
                )
            )

        if search_semantic:
            search_tasks.append(
                self._get_in_time_range_from_db(
                    user_id=user_id,
                    db_path=self.semantic_db_path,
                    start_iso=start_iso,
                    end_iso=end_iso,
                    memory_type="semantic",
                    limit=limit,
                )
            )

        # Execute searches concurrently
        if search_tasks:
            results_lists = await asyncio.gather(*search_tasks)
            results = []
            for results_list in results_lists:
                results.extend(results_list)
        else:
            results = []

        # Sort all results by timestamp (newest first) and limit
        results.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return results[:limit]

    async def _get_in_time_range_from_db(
        self,
        user_id: str,
        db_path: str,
        start_iso: str,
        end_iso: str,
        memory_type: str,
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Helper method to get memories in time range from a specific database."""
        results = []
        async with aiosqlite.connect(db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()

            query = """
                SELECT id, user_id, content, timestamp, metadata
                FROM memories
                WHERE user_id = ?
                AND timestamp >= ?
                AND timestamp <= ?
                ORDER BY timestamp DESC LIMIT ?
            """
            params = [user_id, start_iso, end_iso, limit]

            await cursor.execute(query, params)
            rows = await cursor.fetchall()

            for row in rows:
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                metadata["type"] = memory_type

                results.append(
                    {
                        "id": row["id"],
                        "text": row["content"],
                        "metadata": metadata,
                        "timestamp": row["timestamp"],
                        "type": memory_type,
                        "score": 1.0,
                    }
                )

        return results

    async def get_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get statistics about stored memories from both databases.

        Args:
            user_id: Optional user ID filter

        Returns:
            Dictionary with statistics
        """
        by_type = {"episodic": 0, "semantic": 0}
        total_count = 0

        # Get episodic stats
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            if user_id:
                await cursor.execute(
                    "SELECT COUNT(*) FROM memories WHERE user_id = ?",
                    (user_id,),
                )
            else:
                await cursor.execute("SELECT COUNT(*) FROM memories")
            row = await cursor.fetchone()
            episodic_count = row[0] if row else 0
            by_type["episodic"] = episodic_count
            total_count += episodic_count

        # Get semantic stats
        async with aiosqlite.connect(self.semantic_db_path) as conn:
            cursor = await conn.cursor()
            if user_id:
                await cursor.execute(
                    "SELECT COUNT(*) FROM memories WHERE user_id = ?",
                    (user_id,),
                )
            else:
                await cursor.execute("SELECT COUNT(*) FROM memories")
            row = await cursor.fetchone()
            semantic_count = row[0] if row else 0
            by_type["semantic"] = semantic_count
            total_count += semantic_count

        return {
            "total_count": total_count,
            "by_type": by_type,
            "faiss_index_size": {
                "episodic": self.episodic_index.ntotal
                if hasattr(self.episodic_index, "ntotal")
                else 0,
                "semantic": self.semantic_index.ntotal
                if hasattr(self.semantic_index, "ntotal")
                else 0,
            },
        }
