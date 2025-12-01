"""
Local Memory Store - SQLite + FAISS implementation for local memory storage.

This module provides a complete local implementation of Mem0 functionality
with zero external API dependencies. All embeddings are generated locally
and all data is stored on the user's device.

Uses aiosqlite for async database operations.
"""
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
    Local memory storage using SQLite for metadata and FAISS for vector search.
    All database operations are async using aiosqlite.
    """

    def __init__(self, embedder: EmbeddingProvider, db_path: Optional[str] = None):
        """
        Initialize the local memory store.

        Args:
            embedder: EmbeddingProvider instance
            db_path: Path to SQLite database (defaults to config_dir/memory/memories.db)
        """
        # Determine database path
        if db_path is None:
            config_dir = get_config_dir()
            memory_dir = config_dir / "memory"
            memory_dir.mkdir(parents=True, exist_ok=True)
            db_path = str(memory_dir / "memories.db")

        self.db_path = db_path
        self.memory_dir = Path(db_path).parent
        self.embedder = embedder

        # Initialize FAISS index
        self.faiss_index_path = self.memory_dir / "faiss.index"
        self.vector_id_to_memory_id: Dict[int, str] = {}
        self.memory_id_to_vector_id: Dict[str, int] = {}
        self.next_vector_id = 0

        if faiss is None:
            raise ImportError(
                "FAISS is not installed. Install with: pip install faiss-cpu"
            )

        if aiosqlite is None:
            raise ImportError(
                "aiosqlite is not installed. Install with: pip install aiosqlite"
            )

        # Load or create FAISS index
        if self.faiss_index_path.exists():
            self.index = faiss.read_index(str(self.faiss_index_path))
            # Load vector ID mappings (sync operation during init)
            # Note: This is called during __init__, so we'll load mappings async later
        else:
            # Create new FAISS index for cosine similarity
            self.index = faiss.IndexFlatIP(self.embedder.dimension)

    async def initialize(self) -> None:
        """
        Async initialization: create database schema and load vector mappings.
        Call this after instantiation to complete setup.
        """
        await self._init_database()
        await self._load_vector_mappings()
        await self._sync_vector_mappings()

    async def _init_database(self) -> None:
        """Initialize SQLite database schema."""
        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.cursor()

            await cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    type TEXT NOT NULL,
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
                CREATE INDEX IF NOT EXISTS idx_user_type
                ON memories(user_id, type)
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
        """Load vector ID to memory ID mappings from database."""
        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id, embedding_id FROM memories
                WHERE embedding_id IS NOT NULL
            """
            )

            rows = await cursor.fetchall()
            for memory_id, vector_id in rows:
                self.vector_id_to_memory_id[vector_id] = memory_id
                self.memory_id_to_vector_id[memory_id] = vector_id
                if vector_id >= self.next_vector_id:
                    self.next_vector_id = vector_id + 1

    async def _sync_vector_mappings(self) -> None:
        """Sync vector mappings: ensure all memories in DB have vector IDs."""
        async with aiosqlite.connect(self.db_path) as conn:
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
                # Get content for this memory
                await cursor.execute(
                    "SELECT content FROM memories WHERE id = ?", (memory_id,)
                )
                row = await cursor.fetchone()
                if row:
                    content = row[0]
                    # Generate embedding and add to FAISS
                    embedding = self.embedder.embed_text(content)
                    embedding = embedding.reshape(1, -1)
                    # Normalize for cosine similarity
                    faiss.normalize_L2(embedding)

                    vector_id = self.next_vector_id
                    self.index.add(embedding)

                    # Update database
                    await cursor.execute(
                        """
                        UPDATE memories SET embedding_id = ? WHERE id = ?
                    """,
                        (vector_id, memory_id),
                    )

                    # Update mappings
                    self.vector_id_to_memory_id[vector_id] = memory_id
                    self.memory_id_to_vector_id[memory_id] = vector_id
                    self.next_vector_id += 1

            await conn.commit()

        # Save FAISS index
        self._save_faiss_index()

    def _save_faiss_index(self) -> None:
        """Save FAISS index to disk (sync operation)."""
        try:
            faiss.write_index(self.index, str(self.faiss_index_path))
        except Exception as e:
            logger.error(f"Failed to save FAISS index: {e}")

    async def add(
        self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Store a memory entry with automatic embedding generation.

        Args:
            text: Content to store
            user_id: User identifier
            metadata: Optional metadata dictionary

        Returns:
            Memory ID string
        """
        memory_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()

        # Extract memory type from metadata
        memory_type = metadata.get("type", "episodic") if metadata else "episodic"

        # Generate embedding
        embedding = self.embedder.embed_text(text)
        embedding = embedding.reshape(1, -1)
        # Normalize for cosine similarity
        faiss.normalize_L2(embedding)

        # Add to FAISS index
        vector_id = self.next_vector_id
        self.index.add(embedding)
        self.next_vector_id += 1

        # Store in SQLite
        metadata_json = json.dumps(metadata) if metadata else None

        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                INSERT INTO memories
                (id, user_id, type, content, timestamp, metadata, embedding_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    memory_id,
                    user_id,
                    memory_type,
                    text,
                    timestamp,
                    metadata_json,
                    vector_id,
                ),
            )
            await conn.commit()

        # Update mappings
        self.vector_id_to_memory_id[vector_id] = memory_id
        self.memory_id_to_vector_id[memory_id] = vector_id

        # Save FAISS index periodically (every 10 additions)
        if self.next_vector_id % 10 == 0:
            self._save_faiss_index()

        logger.debug(f"Stored memory {memory_id} for user {user_id}")
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

        Args:
            query: Search query text
            user_id: User identifier
            filters: Optional metadata filters (e.g., {"metadata.type": "episodic"})
            limit: Maximum number of results

        Returns:
            List of memory dictionaries with 'id', 'text', 'metadata', 'score' keys
        """
        # Generate query embedding
        query_embedding = self.embedder.embed_text(query)
        query_embedding = query_embedding.reshape(1, -1)
        faiss.normalize_L2(query_embedding)

        # Search FAISS index
        k = min(limit * 3, self.index.ntotal) if self.index.ntotal > 0 else limit
        if k == 0:
            return []

        similarities, indices = self.index.search(query_embedding, k)

        # Retrieve memories from database
        results = []
        if not indices[0].size:
            return results

        # Filter indices that exist in mapping
        valid_indices = []
        valid_similarities = []
        for sim, idx in zip(similarities[0], indices[0]):
            if idx in self.vector_id_to_memory_id:
                valid_indices.append(idx)
                valid_similarities.append(sim)

        if not valid_indices:
            return results

        # Get memory IDs
        memory_ids = [self.vector_id_to_memory_id[idx] for idx in valid_indices]
        
        # Batch retrieval from SQLite
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            
            placeholders = ",".join(["?"] * len(memory_ids))
            query = f"""
                SELECT id, user_id, type, content, timestamp, metadata
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

                # Apply metadata filters
                if filters:
                    if not self._matches_filters(metadata, filters):
                        continue

                results.append(
                    {
                        "id": row["id"],
                        "text": row["content"],
                        "metadata": metadata,
                        "score": float(similarity),
                        "timestamp": row["timestamp"],
                        "type": row["type"],
                    }
                )

                if len(results) >= limit:
                    break

        # Sort by score (descending)
        results.sort(key=lambda x: x["score"], reverse=True)

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
        Update memory metadata.

        Args:
            memory_id: Memory ID to update
            metadata: New metadata dictionary (merged with existing)

        Returns:
            True if update successful, False otherwise
        """
        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.cursor()

            # Get existing metadata
            await cursor.execute(
                "SELECT metadata FROM memories WHERE id = ?", (memory_id,)
            )
            row = await cursor.fetchone()

            if not row:
                return False

            # Merge metadata
            existing_metadata = json.loads(row[0]) if row[0] else {}
            if metadata:
                existing_metadata.update(metadata)

            # Update database
            await cursor.execute(
                """
                UPDATE memories SET metadata = ? WHERE id = ?
            """,
                (json.dumps(existing_metadata), memory_id),
            )

            await conn.commit()

        logger.debug(f"Updated memory {memory_id}")
        return True

    async def delete(self, memory_id: str) -> bool:
        """
        Delete a memory entry.

        Args:
            memory_id: Memory ID to delete

        Returns:
            True if deletion successful, False otherwise
        """
        # Get vector ID before deletion
        vector_id = self.memory_id_to_vector_id.get(memory_id)

        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
            deleted = cursor.rowcount > 0
            await conn.commit()

        if deleted:
            # Remove from mappings
            if vector_id is not None:
                self.vector_id_to_memory_id.pop(vector_id, None)
                self.memory_id_to_vector_id.pop(memory_id, None)

            logger.debug(f"Deleted memory {memory_id}")

        return deleted

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
        Useful for getting all records matching certain criteria.

        Args:
            user_id: User identifier
            filters: Optional metadata filters (e.g., {"metadata.type": "episodic"})
            limit: Maximum number of results
            order_by: Column to order by (default: "timestamp")
            order_desc: Whether to order descending (default: True)

        Returns:
            List of memory dictionaries with 'id', 'text', 'metadata', 'timestamp', 'type' keys
        """
        results = []
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()

            # Build query
            query = "SELECT id, user_id, type, content, timestamp, metadata FROM memories WHERE user_id = ?"
            params = [user_id]

            await cursor.execute(query, params)
            rows = await cursor.fetchall()

            for row in rows:
                # Parse metadata
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}

                # Apply metadata filters
                if filters:
                    if not self._matches_filters(metadata, filters):
                        continue

                results.append(
                    {
                        "id": row["id"],
                        "text": row["content"],
                        "metadata": metadata,
                        "timestamp": row["timestamp"],
                        "type": row["type"],
                    }
                )

        # Sort results
        reverse = order_desc
        if order_by == "timestamp":
            results.sort(key=lambda x: x.get("timestamp", ""), reverse=reverse)
        elif order_by == "created_at":
            # Would need created_at in results, but for now use timestamp
            results.sort(key=lambda x: x.get("timestamp", ""), reverse=reverse)

        # Apply limit
        return results[:limit]

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
        Optimized SQL query for time-based retrieval.

        Args:
            user_id: User identifier
            start_time: Start datetime (inclusive)
            end_time: End datetime (inclusive)
            memory_type: Optional filter by memory type
            limit: Maximum number of results

        Returns:
            List of memory dictionaries sorted by timestamp (newest first)
        """
        start_iso = start_time.isoformat()
        end_iso = end_time.isoformat()
        results = []

        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()

            query = """
                SELECT id, user_id, type, content, timestamp, metadata
                FROM memories
                WHERE user_id = ?
                AND timestamp >= ?
                AND timestamp <= ?
            """
            params = [user_id, start_iso, end_iso]

            if memory_type:
                query += " AND type = ?"
                params.append(memory_type)

            # Order by timestamp desc (newest first)
            query += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)

            await cursor.execute(query, params)
            rows = await cursor.fetchall()

            for row in rows:
                # Parse metadata
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}

                results.append(
                    {
                        "id": row["id"],
                        "text": row["content"],
                        "metadata": metadata,
                        "timestamp": row["timestamp"],
                        "type": row["type"],
                        # Score is not applicable for purely temporal search, but interface might expect it
                        "score": 1.0 
                    }
                )

        return results

    async def get_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get statistics about stored memories.

        Args:
            user_id: Optional user ID filter

        Returns:
            Dictionary with statistics
        """
        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.cursor()

            if user_id:
                await cursor.execute(
                    """
                    SELECT type, COUNT(*) as count
                    FROM memories
                    WHERE user_id = ?
                    GROUP BY type
                """,
                    (user_id,),
                )
                by_type_rows = await cursor.fetchall()
                by_type = {row[0]: row[1] for row in by_type_rows}

                await cursor.execute(
                    """
                    SELECT COUNT(*) FROM memories WHERE user_id = ?
                """,
                    (user_id,),
                )
                total_row = await cursor.fetchone()
                total_count = total_row[0] if total_row else 0
            else:
                await cursor.execute(
                    """
                    SELECT type, COUNT(*) as count
                    FROM memories
                    GROUP BY type
                """
                )
                by_type_rows = await cursor.fetchall()
                by_type = {row[0]: row[1] for row in by_type_rows}

                await cursor.execute("SELECT COUNT(*) FROM memories")
                total_row = await cursor.fetchone()
                total_count = total_row[0] if total_row else 0

        return {
            "total_count": total_count,
            "by_type": by_type,
            "faiss_index_size": self.index.ntotal
            if hasattr(self.index, "ntotal")
            else 0,
        }
