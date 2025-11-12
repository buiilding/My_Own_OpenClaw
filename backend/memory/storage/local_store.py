"""
Local Memory Store - SQLite + FAISS implementation for local memory storage.

This module provides a complete local implementation of Mem0 functionality
with zero external API dependencies. All embeddings are generated locally
and all data is stored on the user's device.
"""
import json
import logging
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer

try:
    import faiss
except ImportError:
    # Fallback if FAISS not available
    faiss = None

from backend.config import get_config_dir

logger = logging.getLogger(__name__)

# FAISS index dimension (384 for all-MiniLM-L6-v2)
EMBEDDING_DIM = 384


class LocalMemoryStore:
    """
    Local memory storage using SQLite for metadata and FAISS for vector search.

    Provides Mem0-like API but runs entirely locally with no external dependencies.
    """

    def __init__(
        self, db_path: Optional[str] = None, embedding_model: str = "all-MiniLM-L6-v2"
    ):
        """
        Initialize the local memory store.

        Args:
            db_path: Path to SQLite database (defaults to config_dir/memory/memories.db)
            embedding_model: SentenceTransformer model name for embeddings
        """
        # Determine database path
        if db_path is None:
            config_dir = get_config_dir()
            memory_dir = config_dir / "memory"
            memory_dir.mkdir(parents=True, exist_ok=True)
            db_path = str(memory_dir / "memories.db")

        self.db_path = db_path
        self.memory_dir = Path(db_path).parent

        # Initialize embedding model
        logger.info(f"Loading embedding model: {embedding_model}")
        self.embedder = SentenceTransformer(embedding_model)

        # Initialize FAISS index
        self.faiss_index_path = self.memory_dir / "faiss.index"
        self.vector_id_to_memory_id: Dict[int, str] = {}
        self.memory_id_to_vector_id: Dict[str, int] = {}
        self.next_vector_id = 0

        if faiss is None:
            raise ImportError(
                "FAISS is not installed. Install with: pip install faiss-cpu"
            )

        # Load or create FAISS index
        if self.faiss_index_path.exists():
            self.index = faiss.read_index(str(self.faiss_index_path))
            # Load vector ID mappings
            self._load_vector_mappings()
        else:
            # Create new FAISS index for cosine similarity (inner product on normalized vectors)
            self.index = faiss.IndexFlatIP(EMBEDDING_DIM)

        # Initialize SQLite database
        self._init_database()

        # Sync vector mappings with database
        self._sync_vector_mappings()

    def _init_database(self) -> None:
        """Initialize SQLite database schema."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            cursor.execute(
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

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_user_type
                ON memories(user_id, type)
            """
            )

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_timestamp
                ON memories(timestamp)
            """
            )

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_embedding_id
                ON memories(embedding_id)
            """
            )

            conn.commit()

    def _load_vector_mappings(self) -> None:
        """Load vector ID to memory ID mappings from database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, embedding_id FROM memories
                WHERE embedding_id IS NOT NULL
            """
            )

            for memory_id, vector_id in cursor.fetchall():
                self.vector_id_to_memory_id[vector_id] = memory_id
                self.memory_id_to_vector_id[memory_id] = vector_id
                if vector_id >= self.next_vector_id:
                    self.next_vector_id = vector_id + 1

    def _sync_vector_mappings(self) -> None:
        """Sync vector mappings: ensure all memories in DB have vector IDs."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id FROM memories
                WHERE embedding_id IS NULL
            """
            )

            missing_ids = [row[0] for row in cursor.fetchall()]

            for memory_id in missing_ids:
                # Get content for this memory
                cursor.execute(
                    "SELECT content FROM memories WHERE id = ?", (memory_id,)
                )
                row = cursor.fetchone()
                if row:
                    content = row[0]
                    # Generate embedding and add to FAISS
                    embedding = self.embedder.encode(content, convert_to_numpy=True)
                    embedding = embedding.reshape(1, -1)
                    # Normalize for cosine similarity
                    faiss.normalize_L2(embedding)

                    vector_id = self.next_vector_id
                    self.index.add(embedding)

                    # Update database
                    cursor.execute(
                        """
                        UPDATE memories SET embedding_id = ? WHERE id = ?
                    """,
                        (vector_id, memory_id),
                    )

                    # Update mappings
                    self.vector_id_to_memory_id[vector_id] = memory_id
                    self.memory_id_to_vector_id[memory_id] = vector_id
                    self.next_vector_id += 1

            conn.commit()

        # Save FAISS index
        self._save_faiss_index()

    def _save_faiss_index(self) -> None:
        """Save FAISS index to disk."""
        try:
            faiss.write_index(self.index, str(self.faiss_index_path))
        except Exception as e:
            logger.error(f"Failed to save FAISS index: {e}")

    def add(
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
        embedding = self.embedder.encode(text, convert_to_numpy=True)
        embedding = embedding.reshape(1, -1)
        # Normalize for cosine similarity
        faiss.normalize_L2(embedding)

        # Add to FAISS index
        vector_id = self.next_vector_id
        self.index.add(embedding)
        self.next_vector_id += 1

        # Store in SQLite
        metadata_json = json.dumps(metadata) if metadata else None

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
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
            conn.commit()

        # Update mappings
        self.vector_id_to_memory_id[vector_id] = memory_id
        self.memory_id_to_vector_id[memory_id] = vector_id

        # Save FAISS index periodically (every 10 additions)
        if self.next_vector_id % 10 == 0:
            self._save_faiss_index()

        logger.debug(f"Stored memory {memory_id} for user {user_id}")
        return memory_id

    def search(
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
        query_embedding = self.embedder.encode(query, convert_to_numpy=True)
        query_embedding = query_embedding.reshape(1, -1)
        faiss.normalize_L2(query_embedding)

        # Search FAISS index
        k = min(limit * 3, self.index.ntotal) if self.index.ntotal > 0 else limit
        if k == 0:
            return []

        similarities, indices = self.index.search(query_embedding, k)

        # Retrieve memories from database
        results = []
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            for i, (similarity, vector_id) in enumerate(
                zip(similarities[0], indices[0])
            ):
                if vector_id not in self.vector_id_to_memory_id:
                    continue

                memory_id = self.vector_id_to_memory_id[vector_id]

                cursor.execute(
                    """
                    SELECT id, user_id, type, content, timestamp, metadata
                    FROM memories WHERE id = ?
                """,
                    (memory_id,),
                )

                row = cursor.fetchone()
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

    def update(self, memory_id: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        Update memory metadata.

        Args:
            memory_id: Memory ID to update
            metadata: New metadata dictionary (merged with existing)

        Returns:
            True if update successful, False otherwise
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            # Get existing metadata
            cursor.execute("SELECT metadata FROM memories WHERE id = ?", (memory_id,))
            row = cursor.fetchone()

            if not row:
                return False

            # Merge metadata
            existing_metadata = json.loads(row[0]) if row[0] else {}
            if metadata:
                existing_metadata.update(metadata)

            # Update database
            cursor.execute(
                """
                UPDATE memories SET metadata = ? WHERE id = ?
            """,
                (json.dumps(existing_metadata), memory_id),
            )

            conn.commit()

        logger.debug(f"Updated memory {memory_id}")
        return True

    def delete(self, memory_id: str) -> bool:
        """
        Delete a memory entry.

        Args:
            memory_id: Memory ID to delete

        Returns:
            True if deletion successful, False otherwise
        """
        # Get vector ID before deletion
        vector_id = self.memory_id_to_vector_id.get(memory_id)

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
            deleted = cursor.rowcount > 0
            conn.commit()

        if deleted:
            # Remove from mappings
            if vector_id is not None:
                self.vector_id_to_memory_id.pop(vector_id, None)
                self.memory_id_to_vector_id.pop(memory_id, None)

            logger.debug(f"Deleted memory {memory_id}")

        return deleted

    def get_by_filters(
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
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Build query
            query = "SELECT id, user_id, type, content, timestamp, metadata FROM memories WHERE user_id = ?"
            params = [user_id]

            cursor.execute(query, params)
            rows = cursor.fetchall()

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

    def get_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get statistics about stored memories.

        Args:
            user_id: Optional user ID filter

        Returns:
            Dictionary with statistics
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            if user_id:
                cursor.execute(
                    """
                    SELECT type, COUNT(*) as count
                    FROM memories
                    WHERE user_id = ?
                    GROUP BY type
                """,
                    (user_id,),
                )
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM memories WHERE user_id = ?
                """,
                    (user_id,),
                )
            else:
                cursor.execute(
                    """
                    SELECT type, COUNT(*) as count
                    FROM memories
                    GROUP BY type
                """
                )
                cursor.execute("SELECT COUNT(*) FROM memories")

            by_type = {row[0]: row[1] for row in cursor.fetchall()}
            total_count = cursor.fetchone()[0]

        return {
            "total_count": total_count,
            "by_type": by_type,
            "faiss_index_size": self.index.ntotal
            if hasattr(self.index, "ntotal")
            else 0,
        }
