"""
Frontend Local Memory Store - SQLite + FAISS implementation for local memory storage.

This is a frontend version of the memory store that uses RemoteEmbeddingClient
instead of local embedding providers.
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import aiosqlite
except ImportError:
    aiosqlite = None

try:
    import faiss
except ImportError:
    faiss = None

from core.remote_embedding_client import RemoteEmbeddingClient
from memory.faiss_index import (
    read_index_safe,
    read_index_safe_async,
    save_indices_async,
)
from memory.sqlite_store import (
    init_episodic_schema,
    init_semantic_schema,
    load_vector_mappings,
)
from memory.watermark_state import WatermarkStateStore

logger = logging.getLogger(__name__)


class LocalMemoryStore:
    """
    Local memory storage using separate SQLite databases for episodic and semantic memory.
    Each memory type has its own database and FAISS index for efficient storage and retrieval.
    All database operations are async using aiosqlite.

    Frontend version: Uses RemoteEmbeddingClient for embedding generation.
    """

    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the local memory store with remote embedding client.

        Args:
            db_path: Base directory path for databases (defaults to user data directory)
        """
        # Determine memory directory
        if db_path is None:
            # Use platform-specific user data directory
            # Frontend has its own data folder, separate from backend config
            import os
            import platform
            from pathlib import Path
            
            app_name = "desktop-assistant"
            
            # Manually construct path to avoid platformdirs duplication issue
            if os.name == "nt":  # Windows
                appdata = os.getenv("APPDATA")
                if not appdata:
                    raise ValueError("APPDATA environment variable is not set on Windows")
                db_path = Path(appdata) / app_name
            elif os.name == "posix":
                home_dir = Path.home()
                if platform.system() == "Darwin":  # macOS
                    db_path = home_dir / "Library" / "Application Support" / app_name
                else:  # Linux and other Unix-like
                    db_path = home_dir / ".config" / app_name
            else:
                raise ValueError(f"Unsupported OS: {os.name}")
            
            memory_dir = db_path / "memory"
        else:
            db_path_obj = Path(db_path)
            if db_path_obj.suffix:
                memory_dir = db_path_obj.parent
            else:
                memory_dir = db_path_obj

        try:
            memory_dir.mkdir(parents=True, exist_ok=True)
            if not memory_dir.exists():
                raise OSError(f"Failed to create memory directory: {memory_dir}")
            logger.info(f"Memory directory: {memory_dir} (exists: {memory_dir.exists()})")
        except OSError as e:
            logger.error(f"Failed to create memory directory {memory_dir}: {e}", exc_info=True)
            raise

        self.memory_dir = memory_dir
        self.embedder = RemoteEmbeddingClient()

        # Watermark state file for tracking semanticization progress
        self.watermark_state_path = memory_dir / "watermark_state.json"
        self._watermark_store = WatermarkStateStore(self.watermark_state_path)

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
            raise ImportError("FAISS is not installed. Install with: pip install faiss-cpu")

        if aiosqlite is None:
            raise ImportError("aiosqlite is not installed. Install with: pip install aiosqlite")

        # Load or create FAISS indices
        self.episodic_index = read_index_safe(self.episodic_index_path, faiss)
        self.semantic_index = read_index_safe(self.semantic_index_path, faiss)

    async def initialize(self) -> None:
        """
        Async initialization: create database schemas, initialize embedder, and load vector mappings.
        Call this after instantiation to complete setup.
        """
        # Load or create FAISS indices (blocking ops)
        self.episodic_index = await read_index_safe_async(
            self.episodic_index_path, faiss
        )
        self.semantic_index = await read_index_safe_async(
            self.semantic_index_path, faiss
        )

        # Initialize the remote embedding client
        await self.embedder.initialize()

        # Create database schemas and load vector mappings
        await self._init_databases()
        await self._load_vector_mappings()
        await self._sync_vector_mappings()

        # Initialize FAISS indices if not loaded
        dimension = self.embedder.dimension
        
        if self.episodic_index is None:
            self.episodic_index = faiss.IndexFlatIP(dimension)
        elif self.episodic_index.ntotal == 0 and len(self.episodic_vector_id_to_memory_id) > 0:
            # Index is empty but we have memories - rebuild it
            logger.warning("Episodic FAISS index is empty but memories exist. Rebuilding index...")
            await self._rebuild_index("episodic")
        
        if self.semantic_index is None:
            self.semantic_index = faiss.IndexFlatIP(dimension)
        elif self.semantic_index.ntotal == 0 and len(self.semantic_vector_id_to_memory_id) > 0:
            # Index is empty but we have memories - rebuild it
            logger.warning("Semantic FAISS index is empty but memories exist. Rebuilding index...")
            await self._rebuild_index("semantic")

    async def close(self) -> None:
        """Close the embedding client and save indices."""
        await self.embedder.close()
        await self._save_faiss_indices()

    async def _init_databases(self) -> None:
        """Initialize SQLite database schemas for both memory types."""
        await init_episodic_schema(self.episodic_db_path)
        await init_semantic_schema(self.semantic_db_path)

    async def _load_vector_mappings(self) -> None:
        """Load vector ID to memory ID mappings from both databases."""
        (
            self.episodic_vector_id_to_memory_id,
            self.episodic_memory_id_to_vector_id,
            self.episodic_next_vector_id,
        ) = await load_vector_mappings(self.episodic_db_path)

        (
            self.semantic_vector_id_to_memory_id,
            self.semantic_memory_id_to_vector_id,
            self.semantic_next_vector_id,
        ) = await load_vector_mappings(self.semantic_db_path)

    async def _sync_vector_mappings(self) -> None:
        """Sync vector mappings: ensure all memories in both DBs have vector IDs."""
        self.episodic_next_vector_id = await self._sync_vector_mappings_for_db(
            db_path=self.episodic_db_path,
            index=self.episodic_index,
            vector_id_to_memory_id=self.episodic_vector_id_to_memory_id,
            memory_id_to_vector_id=self.episodic_memory_id_to_vector_id,
            next_vector_id=self.episodic_next_vector_id,
        )

        self.semantic_next_vector_id = await self._sync_vector_mappings_for_db(
            db_path=self.semantic_db_path,
            index=self.semantic_index,
            vector_id_to_memory_id=self.semantic_vector_id_to_memory_id,
            memory_id_to_vector_id=self.semantic_memory_id_to_vector_id,
            next_vector_id=self.semantic_next_vector_id,
        )
        
        # Always save indices after sync to ensure persistence
        await self._save_faiss_indices()

    async def _sync_vector_mappings_for_db(
        self,
        db_path: str,
        index,
        vector_id_to_memory_id: Dict[int, str],
        memory_id_to_vector_id: Dict[str, int],
        next_vector_id: int,
    ) -> int:
        async with aiosqlite.connect(db_path) as conn:
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
                    embedding = await self.embedder.embed_text(content)
                    embedding = embedding.reshape(1, -1)
                    faiss.normalize_L2(embedding)

                    vector_id = next_vector_id
                    index.add(embedding)

                    await cursor.execute(
                        """
                        UPDATE memories SET embedding_id = ? WHERE id = ?
                    """,
                        (vector_id, memory_id),
                    )

                    vector_id_to_memory_id[vector_id] = memory_id
                    memory_id_to_vector_id[memory_id] = vector_id
                    next_vector_id += 1

            await conn.commit()

            # Save index if we added any vectors
            if missing_ids:
                await self._save_faiss_indices()

        return next_vector_id

    async def _save_faiss_indices(self) -> None:
        """Save both FAISS indices to disk (async operation using global thread pool)."""
        await save_indices_async(
            self.episodic_index,
            self.semantic_index,
            self.episodic_index_path,
            self.semantic_index_path,
            faiss,
        )

    async def _rebuild_index(self, memory_type: str) -> None:
        """Rebuild FAISS index from database for a given memory type."""
        if memory_type == "episodic":
            db_path = self.episodic_db_path
            index = self.episodic_index
            vector_id_to_memory_id = self.episodic_vector_id_to_memory_id
            memory_id_to_vector_id = self.episodic_memory_id_to_vector_id
        else:  # semantic
            db_path = self.semantic_db_path
            index = self.semantic_index
            vector_id_to_memory_id = self.semantic_vector_id_to_memory_id
            memory_id_to_vector_id = self.semantic_memory_id_to_vector_id
        
        # Clear existing index
        dimension = self.embedder.dimension
        if memory_type == "episodic":
            self.episodic_index = faiss.IndexFlatIP(dimension)
            index = self.episodic_index
        else:
            self.semantic_index = faiss.IndexFlatIP(dimension)
            index = self.semantic_index
        
        # Rebuild from database
        async with aiosqlite.connect(db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute("SELECT id, content FROM memories WHERE embedding_id IS NOT NULL")
            rows = await cursor.fetchall()
            
            for memory_id, content in rows:
                # Generate embedding
                embedding = await self.embedder.embed_text(content)
                embedding = embedding.reshape(1, -1)
                faiss.normalize_L2(embedding)
                
                # Get or create vector ID
                vector_id = memory_id_to_vector_id.get(memory_id)
                if vector_id is None:
                    # Find next available vector ID
                    vector_id = max(vector_id_to_memory_id.keys(), default=-1) + 1
                    memory_id_to_vector_id[memory_id] = vector_id
                    vector_id_to_memory_id[vector_id] = memory_id
                
                # Add to index (resize if needed)
                if vector_id >= index.ntotal:
                    # Index needs to be resized - FAISS doesn't support this directly
                    # So we need to rebuild the entire index
                    pass
                
                # Add embedding to index
                index.add(embedding)
        
        # Update database with vector IDs
        async with aiosqlite.connect(db_path) as conn:
            cursor = await conn.cursor()
            for memory_id, vector_id in memory_id_to_vector_id.items():
                await cursor.execute(
                    "UPDATE memories SET embedding_id = ? WHERE id = ?",
                    (vector_id, memory_id)
                )
            await conn.commit()
        
        logger.info(f"Rebuilt {memory_type} FAISS index with {index.ntotal} vectors")
        await self._save_faiss_indices()

    async def add(
        self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None, conversation_id: Optional[str] = None
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
        memory_type_str = metadata.get("type", "episodic") if metadata else "episodic"
        
        # Extract conversation_id from metadata if not provided directly
        if conversation_id is None and metadata:
            conversation_id = metadata.get("conversation_id")

        # Convert string to enum for type safety
        try:
            from backend.src.core.types import MemoryType
            memory_type = MemoryType(memory_type_str)
        except (ImportError, ValueError):
            # Fallback if backend types not available
            memory_type = "episodic" if memory_type_str == "episodic" else "semantic"

        # Generate embedding using remote client
        embedding = await self.embedder.embed_text(text)
        embedding = embedding.reshape(1, -1)
        faiss.normalize_L2(embedding)

        # Route to appropriate database and index
        if memory_type in ("episodic", "MemoryType.EPISODIC"):
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
        
        # Only set is_semanticized for episodic memories (semantic memories don't need this field)
        is_semanticized = 0 if memory_type in ("episodic", "MemoryType.EPISODIC") else None

        async with aiosqlite.connect(db_path) as conn:
            cursor = await conn.cursor()
            if is_semanticized is not None:
                # Episodic memory - include is_semanticized and conversation_id
                await cursor.execute(
                    """
                    INSERT INTO memories
                    (id, user_id, content, timestamp, metadata, embedding_id, is_semanticized, conversation_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        memory_id,
                        user_id,
                        text,
                        timestamp,
                        metadata_json,
                        vector_id,
                        is_semanticized,
                        conversation_id,
                    ),
                )
            else:
                # Semantic memory - don't include is_semanticized (column may not exist in semantic DB)
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

        # Save FAISS indices after each addition to ensure persistence
        await self._save_faiss_indices()

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

            # Convert string filter to enum for type safety
            try:
                from backend.src.core.types import MemoryType
                memory_type_enum = MemoryType(memory_type_filter)
                if memory_type_enum == MemoryType.EPISODIC:
                    search_semantic = False
                elif memory_type_enum == MemoryType.SEMANTIC:
                    search_episodic = False
            except (ImportError, ValueError):
                # Invalid memory type filter, ignore it
                pass

        # Generate query embedding using remote client
        query_embedding = await self.embedder.embed_text(query)
        query_embedding = query_embedding.reshape(1, -1)
        faiss.normalize_L2(query_embedding)
        
        self._log_search_start(query, user_id, limit)

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

        all_results = await self._collect_search_results(search_tasks)
        return self._finalize_search_results(all_results, limit)

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
        if not self._has_searchable_index(index, memory_type):
            return []

        valid_indices, valid_similarities = self._search_index(
            index, query_embedding, limit, vector_id_to_memory_id, memory_type
        )
        if not valid_indices:
            return []

        memory_ids = self._map_memory_ids(valid_indices, vector_id_to_memory_id)

        # Batch retrieval from SQLite
        rows_map = await self._fetch_rows_map(db_path, memory_ids)

            # Reconstruct results in order of similarity
            for memory_id, similarity in zip(memory_ids, valid_similarities):
                row = rows_map.get(memory_id)
                if not row:
                    continue

                # Apply user_id filter
                if row["user_id"] != user_id:
                    continue

                metadata = self._parse_metadata(row["metadata"], memory_type)
                if not self._passes_metadata_filters(metadata, filters):
                    continue

                results.append(
                    self._build_search_result(row, metadata, similarity, memory_type)
                )

        return results

    def _has_searchable_index(self, index, memory_type: str) -> bool:
        if index is None or index.ntotal == 0:
            logger.debug(
                "FAISS index for %s is empty or None (ntotal: %s)",
                memory_type,
                index.ntotal if index else "None",
            )
            return False
        return True

    def _search_index(
        self,
        index,
        query_embedding,
        limit: int,
        vector_id_to_memory_id: Dict[int, str],
        memory_type: str,
    ) -> Tuple[List[int], List[float]]:
        k = min(limit * 3, index.ntotal) if index.ntotal > 0 else limit
        if k == 0:
            logger.debug("No vectors in %s index to search", memory_type)
            return [], []

        similarities, indices = index.search(query_embedding, k)
        if not indices[0].size:
            return [], []

        valid_indices: List[int] = []
        valid_similarities: List[float] = []
        for sim, idx in zip(similarities[0], indices[0]):
            if idx in vector_id_to_memory_id:
                valid_indices.append(idx)
                valid_similarities.append(sim)

        return valid_indices, valid_similarities

    async def _collect_search_results(
        self, search_tasks: List[asyncio.Future]
    ) -> List[Dict[str, Any]]:
        if not search_tasks:
            return []
        results_lists = await asyncio.gather(*search_tasks)
        all_results: List[Dict[str, Any]] = []
        for results in results_lists:
            all_results.extend(results)
        return all_results

    def _finalize_search_results(
        self, all_results: List[Dict[str, Any]], limit: int
    ) -> List[Dict[str, Any]]:
        all_results.sort(key=lambda x: x["score"], reverse=True)
        final_results = all_results[:limit]
        logger.debug(
            "Memory search completed: %s results (from %s total matches)",
            len(final_results),
            len(all_results),
        )
        if final_results:
            logger.debug(
                "Top result score: %.4f, type: %s",
                final_results[0].get("score", 0.0),
                final_results[0].get("type", "N/A"),
            )
        return final_results

    def _log_search_start(self, query: str, user_id: str, limit: int) -> None:
        logger.debug(
            "Searching memories for query: '%s' (user_id: %s, limit: %s)",
            query,
            user_id,
            limit,
        )
        logger.debug(
            "Episodic index ntotal: %s, Semantic index ntotal: %s",
            self.episodic_index.ntotal if self.episodic_index else "None",
            self.semantic_index.ntotal if self.semantic_index else "None",
        )

    def _map_memory_ids(
        self,
        valid_indices: List[int],
        vector_id_to_memory_id: Dict[int, str],
    ) -> List[str]:
        return [vector_id_to_memory_id[idx] for idx in valid_indices]

    def _build_search_result(
        self,
        row: Any,
        metadata: Dict[str, Any],
        similarity: float,
        memory_type: str,
    ) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "text": row["content"],
            "metadata": metadata,
            "score": float(similarity),
            "timestamp": row["timestamp"],
            "type": memory_type,
        }

    async def _fetch_rows_map(
        self, db_path: str, memory_ids: List[str]
    ) -> Dict[str, Any]:
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

            return {row["id"]: row for row in rows}

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

    def _parse_metadata(self, raw_metadata: Optional[str], memory_type: str) -> Dict[str, Any]:
        metadata = self._parse_raw_metadata(raw_metadata)
        metadata["type"] = memory_type
        return metadata

    def _parse_raw_metadata(self, raw_metadata: Optional[str]) -> Dict[str, Any]:
        return json.loads(raw_metadata) if raw_metadata else {}

    def _passes_metadata_filters(
        self, metadata: Dict[str, Any], filters: Optional[Dict[str, Any]]
    ) -> bool:
        if not filters:
            return True
        filtered_filters = {
            key: value
            for key, value in filters.items()
            if key not in ("metadata.type", "type")
        }
        if filtered_filters and not self._matches_filters(metadata, filtered_filters):
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

    async def get_user_ids_with_unsemanticized_memories(
        self, limit: int = 100
    ) -> List[str]:
        """
        Return distinct user IDs that have unsemanticized episodic memories.
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT DISTINCT user_id
                FROM memories
                WHERE is_semanticized = 0
                LIMIT ?
            """,
                (limit,),
            )
            rows = await cursor.fetchall()
            return [row[0] for row in rows if row and row[0]]

    async def semantic_summary_exists(self, summary_hash: str) -> bool:
        """
        Check if a semantic summary with the given hash already exists.
        """
        if not summary_hash:
            return False

        pattern = f'%\"summary_hash\": \"{summary_hash}\"%'
        async with aiosqlite.connect(self.semantic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT 1 FROM memories
                WHERE metadata LIKE ?
                LIMIT 1
            """,
                (pattern,),
            )
            row = await cursor.fetchone()
            return row is not None
    
    async def get_unsemanticized_conversation_windows(
        self, user_id: str
    ) -> List[str]:
        """
        Get list of conversation_id values that have unsummarized memories.
        Returns conversation windows ordered by the earliest unsummarized memory timestamp.
        
        Args:
            user_id: User identifier
            
        Returns:
            List of conversation_id strings (None values are treated as separate windows)
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT conversation_id, MIN(timestamp) as earliest_timestamp
                FROM memories
                WHERE user_id = ? AND is_semanticized = 0
                GROUP BY conversation_id
                ORDER BY earliest_timestamp ASC
            """,
                (user_id,),
            )
            rows = await cursor.fetchall()
            return [row[0] for row in rows]  # conversation_id can be None
    
    async def get_unsemanticized_episodic_memories_by_conversation(
        self, user_id: str, conversation_id: Optional[str], limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """
        Get episodic memories for a specific conversation window that haven't been processed.
        Returns memories in chronological order to maintain conversation history.
        
        Args:
            user_id: User identifier
            conversation_id: Conversation window identifier (None for memories without conversation_id)
            limit: Maximum number of memories to return (for safety)
            
        Returns:
            List of memory dictionaries with 'id', 'content', 'timestamp', 'metadata', 'conversation_id'
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            
            if conversation_id is None:
                await cursor.execute(
                    """
                    SELECT id, content, timestamp, metadata, conversation_id
                    FROM memories
                    WHERE user_id = ? AND is_semanticized = 0 AND conversation_id IS NULL
                    ORDER BY timestamp ASC
                    LIMIT ?
                """,
                    (user_id, limit),
                )
            else:
                await cursor.execute(
                    """
                    SELECT id, content, timestamp, metadata, conversation_id
                    FROM memories
                    WHERE user_id = ? AND is_semanticized = 0 AND conversation_id = ?
                    ORDER BY timestamp ASC
                    LIMIT ?
                """,
                    (user_id, conversation_id, limit),
                )
            
            rows = await cursor.fetchall()
            
            results = []
            for row in rows:
                metadata = self._parse_raw_metadata(row["metadata"])
                results.append({
                    "id": row["id"],
                    "content": row["content"],
                    "timestamp": row["timestamp"],
                    "metadata": metadata,
                    "conversation_id": row["conversation_id"],
                })
            
            return results
    
    async def get_unsemanticized_episodic_memories(
        self, user_id: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        DEPRECATED: Use get_unsemanticized_episodic_memories_by_conversation instead.
        Get episodic memories that haven't been processed into semantic memory.
        
        Args:
            user_id: User identifier
            limit: Maximum number of memories to return
            
        Returns:
            List of memory dictionaries with 'id', 'content', 'timestamp', 'metadata'
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id, content, timestamp, metadata
                FROM memories
                WHERE user_id = ? AND is_semanticized = 0
                ORDER BY timestamp ASC
                LIMIT ?
            """,
                (user_id, limit),
            )
            rows = await cursor.fetchall()
            
            results = []
            for row in rows:
                metadata = self._parse_raw_metadata(row["metadata"])
                results.append({
                    "id": row["id"],
                    "content": row["content"],
                    "timestamp": row["timestamp"],
                    "metadata": metadata,
                })
            
            return results
    
    async def mark_episodic_memories_semanticized(
        self, memory_ids: List[str]
    ) -> None:
        """
        Mark episodic memories as semanticized.
        
        Args:
            memory_ids: List of memory IDs to mark as processed
        """
        if not memory_ids:
            return
            
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            placeholders = ",".join(["?"] * len(memory_ids))
            await cursor.execute(
                f"""
                UPDATE memories
                SET is_semanticized = 1
                WHERE id IN ({placeholders})
            """,
                memory_ids,
            )
            await conn.commit()
            logger.debug(f"Marked {len(memory_ids)} episodic memories as semanticized")
    
    async def get_watermark(self) -> Dict[str, Any]:
        """
        Get current watermark state.
        
        Returns:
            Dictionary with 'last_semanticized_id' and 'pending_message_count'
        """
        return await self._watermark_store.get()
    
    async def update_watermark(self, last_semanticized_id: Optional[str], pending_message_count: int = 0) -> None:
        """
        Update watermark state.
        
        Args:
            last_semanticized_id: ID of the last processed episodic memory (None if none processed)
            pending_message_count: Number of pending messages since last batch
        """
        await self._watermark_store.update(last_semanticized_id, pending_message_count)
        logger.debug(f"Updated watermark: last_id={last_semanticized_id}, pending={pending_message_count}")
    
    async def increment_pending_count(self) -> int:
        """
        Increment pending message count and return new value.
        
        Returns:
            New pending message count
        """
        new_count = await self._watermark_store.increment_pending_count()
        logger.debug(f"Incremented pending count to {new_count}")
        return new_count
    
    async def get_unprocessed_memories_after_id(
        self, last_id: Optional[str], user_id: str, limit: int = 1000 
    ) -> List[Dict[str, Any]]:
        """
        Get all episodic memories after the watermark ID that haven't been processed.
        Returns memories in chronological order (by timestamp, then by id).
        
        Args:
            last_id: Last processed memory ID (None to get all unprocessed)
            user_id: User identifier
            limit: Maximum number of memories to return (safety limit)
            
        Returns:
            List of memory dictionaries with 'id', 'content', 'timestamp', 'metadata', 'conversation_id'
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            
            if last_id is None:
                # No watermark - get all unprocessed memories
                await cursor.execute(
                    """
                    SELECT id, content, timestamp, metadata, conversation_id
                    FROM memories
                    WHERE user_id = ? AND is_semanticized = 0
                    ORDER BY timestamp ASC, id ASC
                    LIMIT ?
                """,
                    (user_id, limit),
                )
            else:
                # Get memories after the watermark ID
                # First, get the timestamp of the watermark memory
                await cursor.execute(
                    "SELECT timestamp FROM memories WHERE id = ?",
                    (last_id,)
                )
                watermark_row = await cursor.fetchone()
                
                if watermark_row:
                    watermark_timestamp = watermark_row[0]
                    # Get all memories with timestamp > watermark, or same timestamp but id > watermark
                    await cursor.execute(
                        """
                        SELECT id, content, timestamp, metadata, conversation_id
                        FROM memories
                        WHERE user_id = ? 
                          AND is_semanticized = 0
                          AND (
                              timestamp > ?
                              OR (timestamp = ? AND id > ?)
                          )
                        ORDER BY timestamp ASC, id ASC
                        LIMIT ?
                    """,
                        (user_id, watermark_timestamp, watermark_timestamp, last_id, limit),
                    )
                else:
                    # Watermark ID not found - treat as if no watermark
                    logger.warning(f"Watermark ID {last_id} not found in database, treating as no watermark")
                    await cursor.execute(
                        """
                        SELECT id, content, timestamp, metadata, conversation_id
                        FROM memories
                        WHERE user_id = ? AND is_semanticized = 0
                        ORDER BY timestamp ASC, id ASC
                        LIMIT ?
                    """,
                        (user_id, limit),
                    )
            
            rows = await cursor.fetchall()
            
            results = []
            for row in rows:
                metadata = self._parse_raw_metadata(row["metadata"])
                results.append({
                    "id": row["id"],
                    "content": row["content"],
                    "timestamp": row["timestamp"],
                    "metadata": metadata,
                    "conversation_id": row["conversation_id"],
                })
            
            return results
