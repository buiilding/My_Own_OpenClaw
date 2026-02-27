"""
Frontend Local Memory Store - SQLite + FAISS implementation for local memory storage.

This is a frontend version of the memory store that uses RemoteEmbeddingClient
instead of local embedding providers.
"""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
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
from core.remote_title_client import RemoteTitleClient
from memory.conversation_search_helpers import group_conversation_search_hits
from memory.conversation_search_helpers import pick_best_conversation_hit
from memory.conversation_search_helpers import safe_timestamp_to_epoch_seconds
from memory.conversation_search_runtime import fetch_conversation_summaries
from memory.conversation_search_runtime import search_transcript_hits_lexical
from memory.conversation_search_runtime import search_transcript_hits_semantic
from memory.conversation_title_helpers import ensure_conversation_title
from memory.conversation_title_helpers import fetch_title_generation_inputs
from memory.conversation_title_helpers import lookup_conversation_title_state
from memory.conversation_title_helpers import normalize_generated_title
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


class _NoopTitleClient:
    async def initialize(self) -> None:
        return None

    async def close(self) -> None:
        return None

    async def generate_title(self, **_kwargs) -> str:
        return ""


@dataclass(frozen=True)
class _MemoryAttrNames:
    db_path: str
    index: str
    vector_id_to_memory_id: str
    memory_id_to_vector_id: str
    next_vector_id: str


class LocalMemoryStore:
    """
    Local memory storage using separate SQLite databases for episodic and semantic memory.
    Each memory type has its own database and FAISS index for efficient storage and retrieval.
    All database operations are async using aiosqlite.

    Frontend version: Uses RemoteEmbeddingClient for embedding generation.
    """

    _MEMORY_ATTRS = {
        "episodic": _MemoryAttrNames(
            db_path="episodic_db_path",
            index="episodic_index",
            vector_id_to_memory_id="episodic_vector_id_to_memory_id",
            memory_id_to_vector_id="episodic_memory_id_to_vector_id",
            next_vector_id="episodic_next_vector_id",
        ),
        "semantic": _MemoryAttrNames(
            db_path="semantic_db_path",
            index="semantic_index",
            vector_id_to_memory_id="semantic_vector_id_to_memory_id",
            memory_id_to_vector_id="semantic_memory_id_to_vector_id",
            next_vector_id="semantic_next_vector_id",
        ),
    }
    _MEMORY_SCHEMA_INIT = {
        "episodic": init_episodic_schema,
        "semantic": init_semantic_schema,
    }

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
        self.title_client = RemoteTitleClient()
        self._title_generation_tasks: Dict[Tuple[str, str], asyncio.Task[Any]] = {}
        self._title_generation_semaphore = asyncio.Semaphore(2)

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
        await self.title_client.initialize()

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
        await self._cancel_title_generation_tasks()
        await self.title_client.close()
        await self.embedder.close()
        await self._save_faiss_indices()

    async def _init_databases(self) -> None:
        """Initialize SQLite database schemas for both memory types."""
        for memory_type, init_fn in self._MEMORY_SCHEMA_INIT.items():
            attrs = self._get_memory_attrs(memory_type)
            await init_fn(getattr(self, attrs.db_path))

    async def _load_vector_mappings(self) -> None:
        """Load vector ID to memory ID mappings from both databases."""
        for memory_type in self._MEMORY_ATTRS:
            attrs = self._get_memory_attrs(memory_type)
            (
                vector_id_to_memory_id,
                memory_id_to_vector_id,
                next_vector_id,
            ) = await load_vector_mappings(getattr(self, attrs.db_path))
            setattr(self, attrs.vector_id_to_memory_id, vector_id_to_memory_id)
            setattr(self, attrs.memory_id_to_vector_id, memory_id_to_vector_id)
            setattr(self, attrs.next_vector_id, next_vector_id)

    async def _sync_vector_mappings(self) -> None:
        """Sync vector mappings: ensure all memories in both DBs have vector IDs."""
        for memory_type in self._MEMORY_ATTRS:
            (
                db_path,
                index,
                vector_id_to_memory_id,
                memory_id_to_vector_id,
                next_vector_id,
            ) = self._get_memory_state(memory_type)
            updated_next_vector_id = await self._sync_vector_mappings_for_db(
                memory_type=memory_type,
                db_path=db_path,
                index=index,
                vector_id_to_memory_id=vector_id_to_memory_id,
                memory_id_to_vector_id=memory_id_to_vector_id,
                next_vector_id=next_vector_id,
            )
            self._set_next_vector_id(memory_type, updated_next_vector_id)
        
        # Always save indices after sync to ensure persistence
        await self._save_faiss_indices()

    async def _sync_vector_mappings_for_db(
        self,
        memory_type: str,
        db_path: str,
        index,
        vector_id_to_memory_id: Dict[int, str],
        memory_id_to_vector_id: Dict[str, int],
        next_vector_id: int,
    ) -> int:
        async with aiosqlite.connect(db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            if memory_type == "episodic":
                # Backfill embeddings for semantic candidates in transcript storage.
                await cursor.execute(
                    """
                    SELECT id, content, record_kind, role, message_type
                    FROM memories
                    WHERE embedding_id IS NULL
                """
                )
            else:
                await cursor.execute(
                    """
                    SELECT id, content
                    FROM memories
                    WHERE embedding_id IS NULL
                """
                )

            rows = await cursor.fetchall()
            embedded_count = 0

            for row in rows:
                memory_id = row["id"]
                content = row["content"]
                if memory_type == "episodic":
                    record_kind = row["record_kind"]
                    role = row["role"]
                    message_type = row["message_type"]
                    if not self._should_embed_episodic_entry(
                        record_kind=record_kind,
                        role=role,
                        message_type=message_type,
                    ):
                        continue

                if not content:
                    continue

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
                embedded_count += 1

            await conn.commit()

            # Save index if we added any vectors
            if embedded_count > 0:
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

    def _get_memory_attrs(self, memory_type: str) -> _MemoryAttrNames:
        try:
            return self._MEMORY_ATTRS[memory_type]
        except KeyError as exc:
            raise ValueError(f"Unsupported memory type: {memory_type}") from exc

    def _get_memory_state(
        self, memory_type: str
    ) -> Tuple[str, Any, Dict[int, str], Dict[str, int], int]:
        attrs = self._get_memory_attrs(memory_type)
        return (
            getattr(self, attrs.db_path),
            getattr(self, attrs.index),
            getattr(self, attrs.vector_id_to_memory_id),
            getattr(self, attrs.memory_id_to_vector_id),
            getattr(self, attrs.next_vector_id),
        )

    def _set_memory_index(self, memory_type: str, index) -> None:
        attrs = self._get_memory_attrs(memory_type)
        setattr(self, attrs.index, index)

    def _set_next_vector_id(self, memory_type: str, next_vector_id: int) -> None:
        attrs = self._get_memory_attrs(memory_type)
        setattr(self, attrs.next_vector_id, next_vector_id)

    def _normalize_memory_type(self, memory_type_value: Any) -> str:
        try:
            from backend.src.core.types import MemoryType

            memory_type_enum = MemoryType(memory_type_value)
            if memory_type_enum == MemoryType.EPISODIC:
                return "episodic"
            if memory_type_enum == MemoryType.SEMANTIC:
                return "semantic"
        except (ImportError, ValueError):
            pass

        return "episodic" if str(memory_type_value) == "episodic" else "semantic"

    def _maybe_normalize_memory_type(self, memory_type_value: Any) -> Optional[str]:
        try:
            from backend.src.core.types import MemoryType

            memory_type_enum = MemoryType(memory_type_value)
            if memory_type_enum == MemoryType.EPISODIC:
                return "episodic"
            if memory_type_enum == MemoryType.SEMANTIC:
                return "semantic"
        except (ImportError, ValueError):
            pass

        if memory_type_value in ("episodic", "semantic"):
            return memory_type_value
        return None

    @staticmethod
    def _should_embed_episodic_entry(
        *,
        record_kind: Optional[str],
        role: Optional[str],
        message_type: Optional[str],
    ) -> bool:
        """
        Determine whether an episodic row should have vector embeddings.

        Transcript storage includes low-signal tool chatter (tool-call JSON, verbose logs).
        We index user turns and assistant natural-language responses for memory recall.
        """
        normalized_kind = (record_kind or "memory").strip().lower()
        if normalized_kind != "transcript":
            return True

        normalized_role = (role or "").strip().lower()
        normalized_type = (message_type or "").strip().lower()

        if normalized_role == "user":
            return True

        if normalized_role == "assistant":
            return normalized_type in ("", "llm-text", "error")

        return False

    async def _rebuild_index(self, memory_type: str) -> None:
        """Rebuild FAISS index from database for a given memory type."""
        (
            db_path,
            _,
            vector_id_to_memory_id,
            memory_id_to_vector_id,
            _,
        ) = self._get_memory_state(memory_type)

        # Reset index and in-memory mappings so FAISS position IDs stay aligned.
        dimension = self.embedder.dimension
        index = faiss.IndexFlatIP(dimension)
        self._set_memory_index(memory_type, index)
        vector_id_to_memory_id.clear()
        memory_id_to_vector_id.clear()
        next_vector_id = 0

        # Rebuild from database
        async with aiosqlite.connect(db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id, content
                FROM memories
                WHERE embedding_id IS NOT NULL
                ORDER BY embedding_id ASC, id ASC
                """
            )
            rows = await cursor.fetchall()

            for memory_id, content in rows:
                if not content:
                    await cursor.execute(
                        "UPDATE memories SET embedding_id = NULL WHERE id = ?",
                        (memory_id,),
                    )
                    continue

                # Generate embedding
                embedding = await self.embedder.embed_text(content)
                embedding = embedding.reshape(1, -1)
                faiss.normalize_L2(embedding)

                # Add embedding to index
                index.add(embedding)

                vector_id = next_vector_id
                next_vector_id += 1
                vector_id_to_memory_id[vector_id] = memory_id
                memory_id_to_vector_id[memory_id] = vector_id

                await cursor.execute(
                    "UPDATE memories SET embedding_id = ? WHERE id = ?",
                    (vector_id, memory_id),
                )
            await conn.commit()

        self._set_next_vector_id(memory_type, next_vector_id)
        logger.info(f"Rebuilt {memory_type} FAISS index with {index.ntotal} vectors")
        await self._save_faiss_indices()

    async def add(
        self,
        text: str,
        user_id: str,
        metadata: Optional[Dict[str, Any]] = None,
        conversation_id: Optional[str] = None,
        record_kind: str = "memory",
        role: Optional[str] = None,
        message_index: Optional[int] = None,
        message_type: Optional[str] = None,
        tool_name: Optional[str] = None,
        correlation_id: Optional[str] = None,
        model_id: Optional[str] = None,
        model_provider: Optional[str] = None,
        screenshot: Optional[str] = None,
        skip_embedding: bool = False,
        timestamp: Optional[str] = None,
    ) -> str:
        """
        Store a memory entry with automatic embedding generation.
        Routes to the appropriate database based on memory type.

        Args:
            text: Content to store
            user_id: User identifier
            metadata: Optional metadata dictionary (must include "type": "episodic" or "semantic")
            record_kind: "memory" (default) or "transcript"
            role: Optional role for transcript entries ("user", "assistant", "tool")
            message_index: Optional per-conversation ordering index
            message_type: Optional message type (e.g. "llm-text", "tool-call", "tool-output")
            tool_name: Optional tool name for tool-related entries
            correlation_id: Optional correlation id for tool calls/outputs
            model_id: Optional model id used for the transcript entry
            model_provider: Optional model provider for the transcript entry
            screenshot: Optional base64 screenshot (stored for transcripts)
            skip_embedding: Skip embedding/FAISS indexing (useful for transcript rows)
            timestamp: Optional ISO timestamp to store (defaults to now)

        Returns:
            Memory ID string
        """
        memory_id = str(uuid.uuid4())
        timestamp_value = self._normalize_timestamp(timestamp)

        # Extract memory type from metadata (default to episodic for backward compatibility)
        memory_type_str = metadata.get("type", "episodic") if metadata else "episodic"
        
        # Extract conversation_id from metadata if not provided directly
        if conversation_id is None and metadata:
            conversation_id = metadata.get("conversation_id")

        # Convert string to enum for type safety
        memory_type = self._normalize_memory_type(memory_type_str)

        if record_kind == "transcript" and memory_type != "episodic":
            memory_type = "episodic"

        (
            db_path,
            index,
            vector_id_to_memory_id,
            memory_id_to_vector_id,
            next_vector_id,
        ) = self._get_memory_state(memory_type)

        vector_id = None
        if not skip_embedding:
            # Generate embedding using remote client
            embedding = await self.embedder.embed_text(text)
            embedding = embedding.reshape(1, -1)
            faiss.normalize_L2(embedding)

            # Route to appropriate database and index
            vector_id = next_vector_id
            self._set_next_vector_id(memory_type, next_vector_id + 1)

            # Add to FAISS index
            index.add(embedding)

        # Store in SQLite
        metadata_json = json.dumps(metadata) if metadata else None
        
        # Only set is_semanticized for episodic memories (semantic memories don't need this field)
        is_semanticized = 0 if memory_type == "episodic" else None

        async with aiosqlite.connect(db_path) as conn:
            cursor = await conn.cursor()
            if is_semanticized is not None:
                # Episodic memory - include is_semanticized and conversation_id
                await cursor.execute(
                    """
                    INSERT INTO memories
                    (id, user_id, content, timestamp, metadata, embedding_id, is_semanticized, conversation_id, record_kind, role, message_index, message_type, tool_name, correlation_id, model_id, model_provider, screenshot)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        memory_id,
                        user_id,
                        text,
                        timestamp_value,
                        metadata_json,
                        vector_id,
                        is_semanticized,
                        conversation_id,
                        record_kind,
                        role,
                        message_index,
                        message_type,
                        tool_name,
                        correlation_id,
                        model_id,
                        model_provider,
                        screenshot,
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
                        timestamp_value,
                        metadata_json,
                        vector_id,
                    ),
                )
            await conn.commit()

        # Update mappings
        if not skip_embedding and vector_id_to_memory_id is not None and memory_id_to_vector_id is not None:
            vector_id_to_memory_id[vector_id] = memory_id
            memory_id_to_vector_id[memory_id] = vector_id

        # Save FAISS indices after each addition to ensure persistence
        if not skip_embedding:
            await self._save_faiss_indices()

        normalized_message_type = (message_type or "").strip().lower().replace("_", "-")
        if (
            memory_type == "episodic"
            and record_kind == "transcript"
            and conversation_id
            and role == "assistant"
            and normalized_message_type == "llm-text"
        ):
            await self._maybe_generate_conversation_title(
                user_id=user_id,
                conversation_id=conversation_id,
                preferred_model_id=model_id,
                preferred_model_provider=model_provider,
            )

        logger.debug(f"Stored {memory_type} memory {memory_id} for user {user_id}")
        return memory_id

    @staticmethod
    def _normalize_timestamp(timestamp: Optional[str]) -> str:
        """
        Normalize timestamps to ISO-8601 with timezone info (UTC preferred).

        Existing rows may contain naive timestamps; we keep read-path tolerant, but
        new writes should always include an explicit timezone to avoid mixed arithmetic.
        """
        if not timestamp:
            return datetime.now(timezone.utc).isoformat()

        text = timestamp.strip()
        if not text:
            return datetime.now(timezone.utc).isoformat()

        try:
            if text.endswith("Z"):
                text = text.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(text)
            if parsed.tzinfo is None:
                local_tz = datetime.now().astimezone().tzinfo or timezone.utc
                parsed = parsed.replace(tzinfo=local_tz)
            return parsed.astimezone(timezone.utc).isoformat()
        except Exception:
            return timestamp

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
            normalized_type = self._maybe_normalize_memory_type(memory_type_filter)
            if normalized_type == "episodic":
                search_semantic = False
            elif normalized_type == "semantic":
                search_episodic = False

        self._log_search_start(query, user_id, limit)
        search_targets = self._build_search_targets(search_episodic, search_semantic)
        if not search_targets:
            logger.debug("Skipping memory search embedding call: no searchable indices")
            return []

        # Generate query embedding using remote client
        query_embedding = await self.embedder.embed_text(query)
        query_embedding = query_embedding.reshape(1, -1)
        faiss.normalize_L2(query_embedding)

        # Search both databases in parallel
        search_tasks = [
            self._search_database(
                query_embedding=query_embedding,
                user_id=user_id,
                db_path=db_path,
                index=index,
                vector_id_to_memory_id=vector_id_to_memory_id,
                memory_type=memory_type,
                filters=filters,
                limit=limit,
            )
            for memory_type, db_path, index, vector_id_to_memory_id in search_targets
        ]
        all_results = await self._collect_search_results(search_tasks)
        return self._finalize_search_results(all_results, limit)

    def _build_search_targets(
        self,
        search_episodic: bool,
        search_semantic: bool,
    ) -> List[Tuple[str, str, Any, Dict[int, str]]]:
        search_targets: List[Tuple[str, str, Any, Dict[int, str]]] = []

        for memory_type in self._MEMORY_ATTRS:
            if memory_type == "episodic" and not search_episodic:
                continue
            if memory_type == "semantic" and not search_semantic:
                continue

            db_path, index, vector_id_to_memory_id, _, _ = self._get_memory_state(
                memory_type
            )
            if not self._has_searchable_index(index, memory_type):
                continue

            search_targets.append(
                (memory_type, db_path, index, vector_id_to_memory_id)
            )

        return search_targets

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
        rows_map = await self._fetch_rows_map(
            db_path,
            memory_ids,
            include_conversation_id=(memory_type == "episodic"),
        )
        results: List[Dict[str, Any]] = []
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
        row: Dict[str, Any],
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
            "conversation_id": row.get("conversation_id"),
        }

    async def _fetch_rows_map(
        self,
        db_path: str,
        memory_ids: List[str],
        include_conversation_id: bool = False,
    ) -> Dict[str, Dict[str, Any]]:
        async with aiosqlite.connect(db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()

            placeholders = ",".join(["?"] * len(memory_ids))
            select_columns = "id, user_id, content, timestamp, metadata"
            if include_conversation_id:
                select_columns += ", conversation_id"
            query = f"""
                SELECT {select_columns}
                FROM memories WHERE id IN ({placeholders})
            """

            await cursor.execute(query, memory_ids)
            rows = await cursor.fetchall()

            return {row["id"]: dict(row) for row in rows}

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
                await self._cleanup_index_artifacts_if_empty("episodic")
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
                await self._cleanup_index_artifacts_if_empty("semantic")
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
                    """
                    SELECT COUNT(*) FROM memories
                    WHERE user_id = ?
                    """,
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
        Return distinct user IDs that have unsemanticized episodic interaction memories.
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT user_id, MAX(timestamp) as latest_timestamp
                FROM memories
                WHERE is_semanticized = 0
                  AND record_kind = 'interaction'
                GROUP BY user_id
                ORDER BY latest_timestamp DESC
                LIMIT ?
            """,
                (limit,),
            )
            rows = await cursor.fetchall()
            return [row[0] for row in rows if row and row[0]]

    async def count_unsemanticized_interaction_memories(
        self,
        user_id: Optional[str] = None,
    ) -> int:
        """
        Count unsemanticized episodic interaction rows.

        Args:
            user_id: Optional user filter.
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            if user_id:
                await cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM memories
                    WHERE user_id = ?
                      AND is_semanticized = 0
                      AND record_kind = 'interaction'
                """,
                    (user_id,),
                )
            else:
                await cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM memories
                    WHERE is_semanticized = 0
                      AND record_kind = 'interaction'
                """
                )
            row = await cursor.fetchone()
            return int(row[0]) if row else 0

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

    async def list_conversations(
        self, user_id: str, limit: int = 200, record_kind: Optional[str] = "transcript"
    ) -> List[Dict[str, Any]]:
        """
        List conversation windows for a user.
        Returns latest conversations first based on last message timestamp.

        Args:
            user_id: User identifier
            limit: Maximum number of conversations to return
            record_kind: Optional filter. Transcript-only; non-transcript values are ignored.

        Returns:
            List of conversation summaries with timestamps and entry counts
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            normalized_record_kind = "transcript"
            rows = await self._list_conversations_with_record_kind(
                cursor,
                user_id=user_id,
                limit=limit,
                record_kind=normalized_record_kind,
            )

            results = []
            for row in rows:
                conversation_id = row["conversation_id"]
                title, title_source = await ensure_conversation_title(
                    cursor=cursor,
                    user_id=user_id,
                    conversation_id=conversation_id,
                    existing_title=row["title"],
                    existing_title_source=row["title_source"],
                    existing_title_locked=row["title_locked"],
                )
                if not isinstance(title, str) or not title.strip():
                    continue
                results.append({
                    "conversation_id": conversation_id,
                    "first_timestamp": row["first_timestamp"],
                    "last_timestamp": row["last_timestamp"],
                    "entry_count": row["entry_count"],
                    "record_kind": row["record_kind"],
                    "model_id": row["model_id"],
                    "model_provider": row["model_provider"],
                    "title": title.strip(),
                    "title_source": title_source or "model",
                    "is_resumable": bool(
                        isinstance(conversation_id, str)
                        and conversation_id.startswith("conv_")
                    ),
                })

            await conn.commit()
            return results

    async def search_conversations(
        self,
        user_id: str,
        query: str,
        limit: int = 40,
        lexical_limit: int = 120,
        semantic_limit: int = 40,
    ) -> List[Dict[str, Any]]:
        """
        Search transcript conversations by message content.

        Ranking combines lexical transcript matches (FTS5/LIKE fallback),
        semantic transcript matches (vector search), and recency.
        """
        normalized_query = (query or "").strip()
        if len(normalized_query) < 2:
            return []

        lexical_hits: List[Dict[str, Any]] = []
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            lexical_hits = await search_transcript_hits_lexical(
                cursor=cursor,
                user_id=user_id,
                query=normalized_query,
                limit=max(1, lexical_limit),
                logger=logger,
            )

        semantic_hits = await search_transcript_hits_semantic(
            store=self,
            user_id=user_id,
            query=normalized_query,
            limit=max(1, semantic_limit),
            logger=logger,
        )

        grouped_hits = group_conversation_search_hits(lexical_hits, semantic_hits)
        if not grouped_hits:
            return []

        conversation_ids = list(grouped_hits.keys())
        summaries: Dict[str, Dict[str, Any]] = {}
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            summaries = await fetch_conversation_summaries(
                cursor=cursor,
                user_id=user_id,
                conversation_ids=conversation_ids,
            )
            await conn.commit()

        scored_rows: List[Dict[str, Any]] = []
        now_ts = datetime.now(timezone.utc).timestamp()
        for conversation_id, hit_info in grouped_hits.items():
            summary = summaries.get(conversation_id)
            if not summary:
                continue

            best_hit = pick_best_conversation_hit(hit_info)
            lexical_best = float(hit_info.get("lexical_best", 0.0))
            semantic_best = float(hit_info.get("semantic_best", 0.0))
            match_count = int(hit_info.get("match_count", 0))

            last_ts = safe_timestamp_to_epoch_seconds(summary.get("last_timestamp"))
            age_days = max(0.0, (now_ts - last_ts) / 86400.0) if last_ts > 0 else 3650.0
            recency_boost = 1.0 / (1.0 + (age_days / 14.0))
            final_score = (
                (lexical_best * 0.56)
                + (semantic_best * 0.32)
                + (min(match_count, 8) * 0.03)
                + (recency_boost * 0.12)
            )

            scored_rows.append({
                **summary,
                "score": float(final_score),
                "match_count": match_count,
                "lexical_match_count": int(hit_info.get("lexical_match_count", 0)),
                "semantic_match_count": int(hit_info.get("semantic_match_count", 0)),
                "match_source": best_hit.get("source"),
                "matched_role": best_hit.get("role"),
                "matched_at": best_hit.get("timestamp"),
                "snippet": best_hit.get("snippet"),
            })

        scored_rows.sort(
            key=lambda row: (
                float(row.get("score", 0.0)),
                safe_timestamp_to_epoch_seconds(row.get("last_timestamp")),
            ),
            reverse=True,
        )
        return scored_rows[: max(1, limit)]

    async def _maybe_generate_conversation_title(
        self,
        user_id: str,
        conversation_id: str,
        preferred_model_id: Optional[str] = None,
        preferred_model_provider: Optional[str] = None,
    ) -> None:
        """
        Non-blocking title generation trigger after assistant transcript writes.
        """
        if not conversation_id:
            return
        self._ensure_title_generation_runtime_state()
        task_key = (user_id, conversation_id)
        existing_task = self._title_generation_tasks.get(task_key)
        if existing_task and not existing_task.done():
            return

        task = asyncio.create_task(
            self._run_conversation_title_generation(
                user_id=user_id,
                conversation_id=conversation_id,
                preferred_model_id=preferred_model_id,
                preferred_model_provider=preferred_model_provider,
            ),
            name=f"title-gen:{user_id}:{conversation_id}",
        )
        self._title_generation_tasks[task_key] = task

        def _cleanup(done_task: asyncio.Task[Any]) -> None:
            current = self._title_generation_tasks.get(task_key)
            if current is done_task:
                self._title_generation_tasks.pop(task_key, None)

        task.add_done_callback(_cleanup)

    def _ensure_title_generation_runtime_state(self) -> None:
        if not hasattr(self, "title_client") or self.title_client is None:
            # Test harnesses that instantiate via __new__ can omit title wiring.
            self.title_client = _NoopTitleClient()
        if not hasattr(self, "_title_generation_tasks") or self._title_generation_tasks is None:
            self._title_generation_tasks = {}
        if (
            not hasattr(self, "_title_generation_semaphore")
            or self._title_generation_semaphore is None
        ):
            self._title_generation_semaphore = asyncio.Semaphore(2)

    async def _cancel_title_generation_tasks(self) -> None:
        self._ensure_title_generation_runtime_state()
        pending_tasks = [
            task
            for task in self._title_generation_tasks.values()
            if task and not task.done()
        ]
        if not pending_tasks:
            self._title_generation_tasks.clear()
            return
        for task in pending_tasks:
            task.cancel()
        await asyncio.gather(*pending_tasks, return_exceptions=True)
        self._title_generation_tasks.clear()

    async def _run_conversation_title_generation(
        self,
        *,
        user_id: str,
        conversation_id: str,
        preferred_model_id: Optional[str],
        preferred_model_provider: Optional[str],
    ) -> None:
        self._ensure_title_generation_runtime_state()
        try:
            async with self._title_generation_semaphore:
                await self._generate_conversation_title_and_persist(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    preferred_model_id=preferred_model_id,
                    preferred_model_provider=preferred_model_provider,
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(
                "Failed to generate conversation title (user_id=%s conversation_id=%s): %s",
                user_id,
                conversation_id,
                exc,
            )

    async def _generate_conversation_title_and_persist(
        self,
        *,
        user_id: str,
        conversation_id: str,
        preferred_model_id: Optional[str],
        preferred_model_provider: Optional[str],
    ) -> None:
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()

            current_title, _, is_locked = await lookup_conversation_title_state(
                cursor=cursor,
                user_id=user_id,
                conversation_id=conversation_id,
            )
            if current_title or is_locked:
                return

            first_user_content, first_assistant_content, assistant_model_id, assistant_model_provider = (
                await fetch_title_generation_inputs(
                    cursor=cursor,
                    user_id=user_id,
                    conversation_id=conversation_id,
                    preferred_model_id=preferred_model_id,
                    preferred_model_provider=preferred_model_provider,
                )
            )
            if not first_user_content or not first_assistant_content:
                return

            selected_model_id = (
                preferred_model_id.strip()
                if isinstance(preferred_model_id, str) and preferred_model_id.strip()
                else assistant_model_id
            )
            selected_model_provider = (
                preferred_model_provider.strip()
                if isinstance(preferred_model_provider, str) and preferred_model_provider.strip()
                else assistant_model_provider
            )

            generated_title = await self.title_client.generate_title(
                user_id=user_id,
                user_message=first_user_content,
                assistant_message=first_assistant_content,
                model_id=selected_model_id,
                model_provider=selected_model_provider,
            )
            normalized_title = normalize_generated_title(generated_title)
            if not normalized_title:
                return

            now_iso = datetime.now(timezone.utc).isoformat()
            await cursor.execute(
                """
                INSERT INTO conversation_titles (
                    user_id,
                    conversation_id,
                    title,
                    source,
                    is_locked,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, 0, ?, ?)
                ON CONFLICT(user_id, conversation_id)
                DO UPDATE SET
                    title = excluded.title,
                    source = excluded.source,
                    updated_at = excluded.updated_at
                WHERE conversation_titles.is_locked = 0
            """,
                (
                    user_id,
                    conversation_id,
                    normalized_title,
                    "model",
                    now_iso,
                    now_iso,
                ),
            )
            await conn.commit()

    async def list_semantic_memories(
        self, user_id: str, limit: int = 200
    ) -> List[Dict[str, Any]]:
        """
        List semantic memories for a user ordered by newest first.

        Args:
            user_id: User identifier
            limit: Maximum number of memories to return

        Returns:
            List of semantic memory entries with parsed metadata
        """
        async with aiosqlite.connect(self.semantic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id, content, timestamp, metadata
                FROM memories
                WHERE user_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            """,
                (user_id, limit),
            )
            rows = await cursor.fetchall()

            results = []
            for row in rows:
                results.append({
                    "id": row["id"],
                    "content": row["content"],
                    "timestamp": row["timestamp"],
                    "metadata": self._parse_raw_metadata(row["metadata"]),
                })

            return results

    async def list_episodic_memories(
        self, user_id: str, limit: int = 200
    ) -> List[Dict[str, Any]]:
        """
        List episodic memory entries for a user excluding transcript conversation rows.

        This powers the memory panel's episodic tab, while transcript conversations stay
        in the sidebar "Your chats" surface.
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id, content, timestamp, metadata, conversation_id, record_kind
                FROM memories
                WHERE user_id = ? AND COALESCE(record_kind, '') != 'transcript'
                ORDER BY timestamp DESC
                LIMIT ?
            """,
                (user_id, limit),
            )
            rows = await cursor.fetchall()

            results = []
            for row in rows:
                parsed_metadata = self._parse_raw_metadata(row["metadata"])
                results.append({
                    "id": row["id"],
                    "content": row["content"],
                    "timestamp": row["timestamp"],
                    "metadata": parsed_metadata,
                    "conversation_id": row["conversation_id"],
                    "record_kind": row["record_kind"] or parsed_metadata.get("record_kind"),
                })

            return results

    async def delete_episodic_memory(self, user_id: str, memory_id: str) -> bool:
        """
        Delete a non-transcript episodic memory entry by ID for a given user.

        Transcript rows are intentionally excluded from this path; transcript
        deletions should continue through conversation-level deletion.
        """
        if not memory_id:
            return False

        vector_id: Optional[int] = None
        deleted = False

        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT embedding_id
                FROM memories
                WHERE id = ? AND user_id = ? AND COALESCE(record_kind, '') != 'transcript'
            """,
                (memory_id, user_id),
            )
            row = await cursor.fetchone()
            if row:
                try:
                    vector_id = row[0] if row[0] is None else int(row[0])
                except Exception:
                    vector_id = None

            await cursor.execute(
                """
                DELETE FROM memories
                WHERE id = ? AND user_id = ? AND COALESCE(record_kind, '') != 'transcript'
            """,
                (memory_id, user_id),
            )
            deleted = cursor.rowcount > 0
            await conn.commit()

        if deleted and vector_id is not None:
            self.episodic_vector_id_to_memory_id.pop(vector_id, None)
            self.episodic_memory_id_to_vector_id.pop(memory_id, None)
        elif deleted:
            self.episodic_memory_id_to_vector_id.pop(memory_id, None)

        if deleted:
            await self._cleanup_index_artifacts_if_empty("episodic")
            logger.debug("Deleted episodic memory %s (user_id=%s)", memory_id, user_id)
        return bool(deleted)

    async def delete_semantic_memory(self, user_id: str, memory_id: str) -> bool:
        """
        Delete a semantic memory entry by ID for a given user.

        Note: We do not remove vectors from FAISS; we remove DB rows and in-memory
        mappings so stale vectors cannot be resolved back to memory IDs.
        """
        if not memory_id:
            return False

        vector_id: Optional[int] = None
        deleted = False

        async with aiosqlite.connect(self.semantic_db_path) as conn:
            cursor = await conn.cursor()
            await cursor.execute(
                "SELECT embedding_id FROM memories WHERE id = ? AND user_id = ?",
                (memory_id, user_id),
            )
            row = await cursor.fetchone()
            if row:
                try:
                    vector_id = row[0] if row[0] is None else int(row[0])
                except Exception:
                    vector_id = None

            await cursor.execute(
                "DELETE FROM memories WHERE id = ? AND user_id = ?",
                (memory_id, user_id),
            )
            deleted = cursor.rowcount > 0
            await conn.commit()

        if deleted and vector_id is not None:
            self.semantic_vector_id_to_memory_id.pop(vector_id, None)
            self.semantic_memory_id_to_vector_id.pop(memory_id, None)
        elif deleted:
            self.semantic_memory_id_to_vector_id.pop(memory_id, None)

        if deleted:
            await self._cleanup_index_artifacts_if_empty("semantic")
            logger.debug("Deleted semantic memory %s (user_id=%s)", memory_id, user_id)
        return bool(deleted)

    async def delete_conversation(
        self,
        user_id: str,
        conversation_id: Optional[str],
        record_kind: Optional[str] = "transcript",
    ) -> int:
        """
        Delete episodic memories for a given conversation window.

        Note: We do not remove vectors from FAISS; we remove DB rows and in-memory
        mappings so stale vectors cannot be resolved back to memory IDs.

        Args:
            user_id: User identifier
            conversation_id: Conversation window identifier (None deletes rows with NULL conversation_id)
            record_kind: Optional filter. Transcript-only; non-transcript values are ignored.

        Returns:
            Number of rows deleted.
        """
        normalized_record_kind = "transcript"
        record_kind_clause = "AND record_kind = 'transcript'"
        conversation_clause, conversation_params = self._conversation_where_clause(
            conversation_id
        )

        deleted_count = 0

        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            select_params = (user_id, *conversation_params)
            await cursor.execute(
                f"""
                SELECT id, embedding_id
                FROM memories
                WHERE user_id = ? AND {conversation_clause}
                {record_kind_clause}
            """,
                select_params,
            )

            rows = await cursor.fetchall()

            memory_ids: List[str] = []
            vector_ids: List[int] = []
            for memory_id, embedding_id in rows:
                if memory_id:
                    memory_ids.append(memory_id)
                if embedding_id is not None:
                    try:
                        vector_ids.append(int(embedding_id))
                    except Exception:
                        continue

            await cursor.execute(
                f"""
                DELETE FROM memories
                WHERE user_id = ? AND {conversation_clause}
                {record_kind_clause}
            """,
                select_params,
            )

            deleted_count = cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
            if conversation_id is not None:
                await cursor.execute(
                    """
                    DELETE FROM conversation_titles
                    WHERE user_id = ? AND conversation_id = ?
                """,
                    (user_id, conversation_id),
                )
            await conn.commit()

        for vector_id in vector_ids:
            memory_id = self.episodic_vector_id_to_memory_id.pop(vector_id, None)
            if memory_id:
                self.episodic_memory_id_to_vector_id.pop(memory_id, None)

        for memory_id in memory_ids:
            self.episodic_memory_id_to_vector_id.pop(memory_id, None)

        if deleted_count > 0:
            await self._cleanup_index_artifacts_if_empty("episodic")

        logger.debug(
            "Deleted conversation (user_id=%s conversation_id=%s record_kind=%s) -> %s rows",
            user_id,
            conversation_id,
            normalized_record_kind,
            deleted_count,
        )
        return int(deleted_count)

    async def _cleanup_index_artifacts_if_empty(self, memory_type: str) -> None:
        """
        Drop in-memory/disk FAISS artifacts when a memory type has no indexed rows left.

        This ensures "delete everything" workflows also remove persisted vector artifacts.
        """
        db_path, _, vector_id_to_memory_id, memory_id_to_vector_id, _ = self._get_memory_state(
            memory_type
        )

        try:
            async with aiosqlite.connect(db_path) as conn:
                cursor = await conn.cursor()
                await cursor.execute(
                    "SELECT COUNT(*) FROM memories WHERE embedding_id IS NOT NULL"
                )
                row = await cursor.fetchone()
                indexed_rows = int(row[0]) if row and row[0] is not None else 0
        except Exception as e:
            logger.warning(
                "Failed to check remaining indexed rows for %s cleanup: %s",
                memory_type,
                e,
            )
            return

        if indexed_rows > 0:
            return

        self._set_memory_index(memory_type, faiss.IndexFlatIP(self.embedder.dimension))
        vector_id_to_memory_id.clear()
        memory_id_to_vector_id.clear()
        self._set_next_vector_id(memory_type, 0)

        index_path = (
            self.episodic_index_path
            if memory_type == "episodic"
            else self.semantic_index_path
        )
        try:
            index_path.unlink(missing_ok=True)
        except TypeError:
            # Python fallback when missing_ok is unavailable.
            if index_path.exists():
                index_path.unlink()
        except Exception as e:
            logger.warning(
                "Failed to delete %s FAISS index file %s: %s",
                memory_type,
                index_path,
                e,
            )

        logger.debug(
            "Cleared %s FAISS index artifacts after indexed rows reached zero",
            memory_type,
        )

    async def _list_conversations_with_record_kind(
        self,
        cursor,
        user_id: str,
        limit: int,
        record_kind: Optional[str],
    ) -> List[Any]:
        _ = record_kind  # API compatibility; transcript is the only supported kind.
        await cursor.execute(
            """
            SELECT conversation_id,
                   MIN(timestamp) as first_timestamp,
                   MAX(timestamp) as last_timestamp,
                   COUNT(*) as entry_count,
                   record_kind,
                   (
                     SELECT title FROM conversation_titles ct
                     WHERE ct.user_id = ? AND ct.conversation_id = memories.conversation_id
                     LIMIT 1
                   ) as title,
                   (
                     SELECT source FROM conversation_titles ct
                     WHERE ct.user_id = ? AND ct.conversation_id = memories.conversation_id
                     LIMIT 1
                   ) as title_source,
                   (
                     SELECT is_locked FROM conversation_titles ct
                     WHERE ct.user_id = ? AND ct.conversation_id = memories.conversation_id
                     LIMIT 1
                   ) as title_locked,
                   (
                     SELECT model_id FROM memories m2
                     WHERE m2.user_id = ? AND m2.conversation_id = memories.conversation_id
                       AND m2.record_kind = 'transcript'
                       AND m2.model_id IS NOT NULL AND m2.model_id != ''
                     ORDER BY m2.timestamp DESC, m2.message_index DESC
                     LIMIT 1
                   ) as model_id,
                   (
                     SELECT model_provider FROM memories m2
                     WHERE m2.user_id = ? AND m2.conversation_id = memories.conversation_id
                       AND m2.record_kind = 'transcript'
                       AND m2.model_provider IS NOT NULL AND m2.model_provider != ''
                     ORDER BY m2.timestamp DESC, m2.message_index DESC
                     LIMIT 1
                   ) as model_provider
            FROM memories
            WHERE user_id = ? AND record_kind = 'transcript'
            GROUP BY conversation_id
            ORDER BY last_timestamp DESC
            LIMIT ?
        """,
            (user_id, user_id, user_id, user_id, user_id, user_id, limit),
        )
        return await cursor.fetchall()

    async def get_next_message_index(
        self, user_id: str, conversation_id: Optional[str]
    ) -> int:
        """
        Get the next message index for a transcript conversation.
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            cursor = await conn.cursor()
            conversation_clause, conversation_params = self._conversation_where_clause(
                conversation_id
            )
            await cursor.execute(
                f"""
                SELECT MAX(message_index)
                FROM memories
                WHERE user_id = ? AND record_kind = 'transcript' AND {conversation_clause}
            """,
                (user_id, *conversation_params),
            )
            row = await cursor.fetchone()
            max_index = row[0] if row and row[0] is not None else 0
            return int(max_index) + 1

    async def get_episodic_memories_by_conversation(
        self,
        user_id: str,
        conversation_id: Optional[str],
        limit: int = 1000,
        record_kind: Optional[str] = "transcript",
        after_message_index: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get episodic memories for a specific conversation window.
        Returns memories in chronological order to maintain conversation history.

        Args:
            user_id: User identifier
            conversation_id: Conversation window identifier (None for memories without conversation_id)
            limit: Maximum number of memories to return (for safety)
            record_kind: Optional filter. Transcript-only; non-transcript values are ignored.
            after_message_index: Optional cursor. When provided, returns rows with
                message_index strictly greater than this cursor.

        Returns:
            List of memory dictionaries with 'id', 'content', 'timestamp', 'metadata', 'conversation_id'
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()

            _ = record_kind  # API compatibility; transcript is the only supported kind.
            record_kind_clause = "AND record_kind = 'transcript'"
            conversation_clause, conversation_params = self._conversation_where_clause(
                conversation_id
            )
            pagination_clause = ""
            pagination_params: Tuple[Any, ...] = ()
            if isinstance(after_message_index, int):
                pagination_clause = "AND message_index > ?"
                pagination_params = (after_message_index,)

            await cursor.execute(
                f"""
                SELECT id, content, timestamp, metadata, conversation_id, role, message_index, message_type, tool_name, correlation_id, record_kind, model_id, model_provider, screenshot
                FROM memories
                WHERE user_id = ? AND {conversation_clause}
                {record_kind_clause}
                {pagination_clause}
                ORDER BY message_index ASC, timestamp ASC
                LIMIT ?
            """,
                (user_id, *conversation_params, *pagination_params, limit),
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
                    "record_kind": row["record_kind"] or metadata.get("record_kind"),
                    "role": row["role"],
                    "message_index": row["message_index"],
                    "message_type": row["message_type"],
                    "tool_name": row["tool_name"],
                    "correlation_id": row["correlation_id"],
                    "model_id": row["model_id"],
                    "model_provider": row["model_provider"],
                    "screenshot": row["screenshot"],
                })
            
            return results
    
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
                  AND record_kind = 'interaction'
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
            conversation_clause, conversation_params = self._conversation_where_clause(
                conversation_id
            )
            await cursor.execute(
                f"""
                SELECT
                    id,
                    content,
                    timestamp,
                    metadata,
                    conversation_id,
                    record_kind,
                    role,
                    message_type,
                    tool_name
                FROM memories
                WHERE user_id = ? AND is_semanticized = 0
                  AND record_kind = 'interaction'
                  AND {conversation_clause}
                ORDER BY timestamp ASC
                LIMIT ?
            """,
                (user_id, *conversation_params, limit),
            )
            
            rows = await cursor.fetchall()
            return self._format_transcript_rows(rows, include_conversation_id=True)

    @staticmethod
    def _conversation_where_clause(conversation_id: Optional[str]) -> Tuple[str, Tuple[Any, ...]]:
        if conversation_id is None:
            return "conversation_id IS NULL", ()
        return "conversation_id = ?", (conversation_id,)
    
    async def get_unsemanticized_episodic_memories(
        self, user_id: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
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
                SELECT id, content, timestamp, metadata, record_kind, role, message_type, tool_name
                FROM memories
                WHERE user_id = ? AND is_semanticized = 0
                  AND record_kind = 'interaction'
                ORDER BY timestamp ASC
                LIMIT ?
            """,
                (user_id, limit),
            )
            rows = await cursor.fetchall()
            return self._format_transcript_rows(rows, include_conversation_id=False)
    
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
            await cursor.execute(
                """
                WITH watermark AS (
                    SELECT timestamp
                    FROM memories
                    WHERE id = ?
                )
                SELECT
                    id,
                    content,
                    timestamp,
                    metadata,
                    conversation_id,
                    record_kind,
                    role,
                    message_type,
                    tool_name
                FROM memories
                WHERE user_id = ?
                  AND is_semanticized = 0
                  AND record_kind = 'interaction'
                  AND (
                      ? IS NULL
                      OR NOT EXISTS (SELECT 1 FROM watermark)
                      OR timestamp > (SELECT timestamp FROM watermark)
                      OR (
                          timestamp = (SELECT timestamp FROM watermark)
                          AND id > ?
                      )
                  )
                ORDER BY timestamp ASC, id ASC
                LIMIT ?
            """,
                (last_id, user_id, last_id, last_id, limit),
            )
            rows = await cursor.fetchall()
            return self._format_transcript_rows(rows, include_conversation_id=True)

    def _format_transcript_rows(
        self,
        rows: List[Dict[str, Any]],
        *,
        include_conversation_id: bool,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for row in rows:
            metadata = self._parse_raw_metadata(row["metadata"])
            entry = {
                "id": row["id"],
                "content": row["content"],
                "timestamp": row["timestamp"],
                "metadata": metadata,
                "record_kind": row["record_kind"] or metadata.get("record_kind"),
                "role": row["role"] or metadata.get("role"),
                "message_type": row["message_type"] or metadata.get("message_type"),
                "tool_name": row["tool_name"] or metadata.get("tool_name"),
            }
            if include_conversation_id:
                entry["conversation_id"] = row["conversation_id"]
            results.append(entry)
        return results
