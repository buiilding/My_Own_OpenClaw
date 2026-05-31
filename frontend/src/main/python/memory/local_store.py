"""
Frontend Local Memory Store - SQLite + FAISS implementation for local memory storage.

This is a frontend version of the memory store that uses RemoteEmbeddingClient
instead of local embedding providers.
"""

import asyncio
import contextlib
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

import numpy as np

try:
    import aiosqlite
except ImportError:
    aiosqlite = None

try:
    import faiss
except ImportError:
    faiss = None

from core.remote_embedding_client import (
    EmbeddingServiceUnavailableError,
    RemoteEmbeddingClient,
)
from core.remote_title_client import RemoteTitleClient
from core.unicode_sanitizer import (
    find_surrogate_paths,
    sanitize_surrogates,
    sanitize_surrogates_in_text,
)
from memory.admin import clear_chat_history as clear_chat_history_admin
from memory.admin import clear_local_memory as clear_local_memory_admin
from memory.chat_event_store import (
    append_chat_event,
    clear_chat_events,
    delete_chat_conversation,
    get_chat_conversation_revision,
    get_chat_events,
    get_next_chat_event_index,
    init_chat_event_schema,
    list_chat_conversations,
    replace_chat_conversation,
    rewrite_chat_conversation_after_event,
    search_chat_conversations,
)
from memory.conversation_semanticization_runtime import (
    count_unsemanticized_interaction_memories as fetch_unsemanticized_interaction_count,
)
from memory.conversation_semanticization_runtime import (
    get_user_ids_with_unsemanticized_memories as fetch_users_with_unsemanticized_memories,
)
from memory.conversation_semanticization_runtime import (
    semantic_summary_exists as check_semantic_summary_exists,
)
from memory.conversation_title_store import (
    get_conversation_title_state,
    get_first_title_exchange,
    upsert_generated_conversation_title,
)
from memory.conversation_window_runtime import (
    conversation_where_clause,
    format_transcript_rows,
)
from memory.conversation_window_runtime import (
    get_unprocessed_memories_after_id as fetch_unprocessed_memories_after_id,
)
from memory.conversation_window_runtime import (
    get_unsemanticized_conversation_windows as fetch_unsemanticized_conversation_windows,
)
from memory.conversation_window_runtime import (
    get_unsemanticized_episodic_memories as fetch_unsemanticized_episodic_memories,
)
from memory.conversation_window_runtime import (
    get_unsemanticized_episodic_memories_by_conversation as fetch_unsemanticized_episodic_by_conversation,
)
from memory.conversation_window_runtime import (
    mark_episodic_memories_semanticized as mark_semanticized_memories_runtime,
)
from memory.faiss_index import read_index_safe_async, save_indices_async
from memory.index_artifact_cleanup import cleanup_index_artifacts_if_empty
from memory.record_kinds import INTERACTION_RECORD_KIND
from memory.sqlite_store import (
    init_episodic_schema,
    init_semantic_schema,
    load_vector_mappings,
)
from memory.transcript_embedding_policy import (
    build_missing_embedding_rows_query,
    should_embed_episodic_entry,
)
from memory.watermark_state import WatermarkStateStore

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _MemoryAttrNames:
    db_path: str
    index: str
    vector_id_to_memory_id: str
    memory_id_to_vector_id: str
    next_vector_id: str


@dataclass(frozen=True)
class EmbeddingSpaceMetadata:
    embedding_provider_id: str
    embedding_model_id: str
    embedding_dimension: int
    embedding_space_version: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "embedding_provider_id": self.embedding_provider_id,
            "embedding_model_id": self.embedding_model_id,
            "embedding_dimension": self.embedding_dimension,
            "embedding_space_version": self.embedding_space_version,
        }

    @classmethod
    def from_dict(
        cls, payload: Optional[Dict[str, Any]]
    ) -> Optional["EmbeddingSpaceMetadata"]:
        if not isinstance(payload, dict):
            return None

        provider_id = payload.get("embedding_provider_id")
        model_id = payload.get("embedding_model_id")
        dimension = payload.get("embedding_dimension")
        space_version = payload.get("embedding_space_version")

        if not isinstance(provider_id, str) or not provider_id.strip():
            return None
        if not isinstance(model_id, str) or not model_id.strip():
            return None
        if not isinstance(dimension, int) or dimension <= 0:
            return None
        if not isinstance(space_version, str) or not space_version.strip():
            return None

        return cls(
            embedding_provider_id=provider_id.strip(),
            embedding_model_id=model_id.strip(),
            embedding_dimension=dimension,
            embedding_space_version=space_version.strip(),
        )


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

    def __init__(
        self,
        db_path: Optional[str] = None,
        event_sink: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
    ):
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

            app_name = "desktop-assistant"

            # Manually construct path to avoid platformdirs duplication issue
            if os.name == "nt":  # Windows
                appdata = os.getenv("APPDATA")
                if not appdata:
                    raise ValueError(
                        "APPDATA environment variable is not set on Windows"
                    )
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
            logger.info(
                f"Memory directory: {memory_dir} (exists: {memory_dir.exists()})"
            )
        except OSError as e:
            logger.error(
                f"Failed to create memory directory {memory_dir}: {e}", exc_info=True
            )
            raise

        self.memory_dir = memory_dir
        self.embedder = RemoteEmbeddingClient()
        self.title_client = RemoteTitleClient()
        self._event_sink = event_sink
        self._title_generation_tasks: Dict[Tuple[str, str], asyncio.Task[Any]] = {}
        self._title_generation_semaphore = asyncio.Semaphore(2)

        # Watermark state file for tracking semanticization progress
        self.watermark_state_path = memory_dir / "watermark_state.json"
        self._watermark_store = WatermarkStateStore(self.watermark_state_path)
        self.embedding_space_metadata_path = memory_dir / "embedding_space.json"
        self._embedding_space_metadata: Optional[EmbeddingSpaceMetadata] = None

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

        # Indices are loaded during async initialize() to avoid duplicate startup disk reads.
        self.episodic_index = None
        self.semantic_index = None
        self._embedding_space_rebuild_in_progress = False

    def set_event_sink(
        self,
        event_sink: Optional[Callable[[Dict[str, Any]], Awaitable[None]]],
    ) -> None:
        self._event_sink = event_sink

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
        await self.embedder.refresh_embedding_space()
        await self.title_client.initialize()

        # Create database schemas and load vector mappings
        await self._init_databases()
        await self._load_vector_mappings()

        current_embedding_space = self._get_current_embedding_space_metadata()
        dimension = (
            current_embedding_space.embedding_dimension
            if current_embedding_space is not None
            else self.embedder.dimension
        )
        persisted_embedding_space = self._load_embedding_space_metadata()

        if self.episodic_index is None:
            self.episodic_index = faiss.IndexFlatIP(dimension)
        elif (
            self.episodic_index.ntotal == 0
            and len(self.episodic_vector_id_to_memory_id) > 0
        ):
            # Index is empty but we have memories - rebuild it
            logger.warning(
                "Episodic FAISS index is empty but memories exist. Rebuilding index..."
            )
            if self._embedding_service_unavailable():
                logger.info(
                    "Skipping episodic index rebuild because embedding service is unavailable"
                )
            else:
                await self._rebuild_index("episodic")

        if self.semantic_index is None:
            self.semantic_index = faiss.IndexFlatIP(dimension)
        elif (
            self.semantic_index.ntotal == 0
            and len(self.semantic_vector_id_to_memory_id) > 0
        ):
            # Index is empty but we have memories - rebuild it
            logger.warning(
                "Semantic FAISS index is empty but memories exist. Rebuilding index..."
            )
            if self._embedding_service_unavailable():
                logger.info(
                    "Skipping semantic index rebuild because embedding service is unavailable"
                )
            else:
                await self._rebuild_index("semantic")

        if self._embedding_space_rebuild_required(
            persisted_embedding_space=persisted_embedding_space,
            current_embedding_space=current_embedding_space,
        ):
            logger.warning(
                "Embedding space changed from %s to %s. Rebuilding local memory indices.",
                (
                    persisted_embedding_space.to_dict()
                    if persisted_embedding_space
                    else None
                ),
                current_embedding_space.to_dict() if current_embedding_space else None,
            )
            self._embedding_space_rebuild_in_progress = True
            try:
                episodic_rebuilt = await self._rebuild_index("episodic")
                semantic_rebuilt = await self._rebuild_index("semantic")
            finally:
                self._embedding_space_rebuild_in_progress = False
            if (
                current_embedding_space is not None
                and episodic_rebuilt
                and semantic_rebuilt
            ):
                self._save_embedding_space_metadata(current_embedding_space)
        elif current_embedding_space is not None and persisted_embedding_space is None:
            self._save_embedding_space_metadata(current_embedding_space)

        await self._repair_index_mapping_mismatch("episodic")
        await self._repair_index_mapping_mismatch("semantic")
        await self._sync_vector_mappings()

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
        await init_chat_event_schema(self.episodic_db_path)

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
        embedded_total = 0
        for memory_type in self._MEMORY_ATTRS:
            (
                db_path,
                index,
                vector_id_to_memory_id,
                memory_id_to_vector_id,
                next_vector_id,
            ) = self._get_memory_state(memory_type)
            updated_next_vector_id, embedded_count = (
                await self._sync_vector_mappings_for_db(
                    memory_type=memory_type,
                    db_path=db_path,
                    index=index,
                    vector_id_to_memory_id=vector_id_to_memory_id,
                    memory_id_to_vector_id=memory_id_to_vector_id,
                    next_vector_id=next_vector_id,
                )
            )
            self._set_next_vector_id(memory_type, updated_next_vector_id)
            embedded_total += embedded_count

        if embedded_total > 0:
            await self._save_faiss_indices()

    async def _sync_vector_mappings_for_db(
        self,
        memory_type: str,
        db_path: str,
        index,
        vector_id_to_memory_id: Dict[int, str],
        memory_id_to_vector_id: Dict[str, int],
        next_vector_id: int,
    ) -> Tuple[int, int]:
        async with aiosqlite.connect(db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            await cursor.execute(self._missing_embedding_rows_query(memory_type))

            rows = await cursor.fetchall()
            embedded_count = 0

            for row in rows:
                memory_id = row["id"]
                content = row["content"]

                if not content:
                    continue

                try:
                    embedding = await self.embedder.embed_text(content)
                except EmbeddingServiceUnavailableError:
                    logger.info(
                        "Skipping missing embedding backfill because embedding service is unavailable"
                    )
                    break
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
        return next_vector_id, embedded_count

    @staticmethod
    def _missing_embedding_rows_query(memory_type: str) -> str:
        return build_missing_embedding_rows_query(memory_type)

    async def _save_faiss_indices(self) -> None:
        """Save both FAISS indices to disk (async operation using global thread pool)."""
        await save_indices_async(
            self.episodic_index,
            self.semantic_index,
            self.episodic_index_path,
            self.semantic_index_path,
            faiss,
        )

    def _get_current_embedding_space_metadata(self) -> Optional[EmbeddingSpaceMetadata]:
        metadata = getattr(self.embedder, "get_embedding_space_metadata", None)
        payload = metadata() if callable(metadata) else None
        return EmbeddingSpaceMetadata.from_dict(payload)

    def _embedding_service_unavailable(self) -> bool:
        return bool(getattr(self.embedder, "service_unavailable", False))

    def _load_embedding_space_metadata(self) -> Optional[EmbeddingSpaceMetadata]:
        path = getattr(self, "embedding_space_metadata_path", None)
        if path is None or not path.exists():
            return None

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning(
                "Failed to read embedding space metadata from %s: %s", path, exc
            )
            return None

        metadata = EmbeddingSpaceMetadata.from_dict(payload)
        if metadata is None:
            logger.warning("Ignoring malformed embedding space metadata at %s", path)
            return None
        self._embedding_space_metadata = metadata
        return metadata

    def _save_embedding_space_metadata(self, metadata: EmbeddingSpaceMetadata) -> None:
        path = getattr(self, "embedding_space_metadata_path", None)
        if path is None:
            return
        try:
            path.write_text(json.dumps(metadata.to_dict(), indent=2), encoding="utf-8")
            self._embedding_space_metadata = metadata
        except Exception as exc:
            logger.warning(
                "Failed to persist embedding space metadata to %s: %s", path, exc
            )

    @staticmethod
    def _index_dimension(index: Any) -> Optional[int]:
        dimension = getattr(index, "d", None)
        return dimension if isinstance(dimension, int) and dimension > 0 else None

    def _embedding_space_rebuild_required(
        self,
        *,
        persisted_embedding_space: Optional[EmbeddingSpaceMetadata],
        current_embedding_space: Optional[EmbeddingSpaceMetadata],
    ) -> bool:
        if current_embedding_space is None:
            return False

        persisted = persisted_embedding_space or self._embedding_space_metadata
        if persisted is not None:
            if (
                persisted.embedding_space_version
                != current_embedding_space.embedding_space_version
            ):
                return True
            if (
                persisted.embedding_dimension
                != current_embedding_space.embedding_dimension
            ):
                return True
        for index in (self.episodic_index, self.semantic_index):
            index_dimension = self._index_dimension(index)
            if (
                index_dimension is not None
                and index_dimension != current_embedding_space.embedding_dimension
            ):
                return True
        return False

    async def _ensure_runtime_embedding_space_alignment(self) -> None:
        if getattr(self, "_embedding_space_rebuild_in_progress", False):
            return

        current_embedding_space = self._get_current_embedding_space_metadata()
        persisted_embedding_space = (
            getattr(self, "_embedding_space_metadata", None)
            or self._load_embedding_space_metadata()
        )
        if not self._embedding_space_rebuild_required(
            persisted_embedding_space=persisted_embedding_space,
            current_embedding_space=current_embedding_space,
        ):
            if (
                current_embedding_space is not None
                and persisted_embedding_space is None
            ):
                self._save_embedding_space_metadata(current_embedding_space)
            return

        logger.warning(
            "Detected runtime embedding-space change from %s to %s. Rebuilding local indices.",
            persisted_embedding_space.to_dict() if persisted_embedding_space else None,
            current_embedding_space.to_dict() if current_embedding_space else None,
        )
        self._embedding_space_rebuild_in_progress = True
        try:
            episodic_rebuilt = await self._rebuild_index("episodic")
            semantic_rebuilt = await self._rebuild_index("semantic")
        finally:
            self._embedding_space_rebuild_in_progress = False
        if (
            current_embedding_space is not None
            and episodic_rebuilt
            and semantic_rebuilt
        ):
            self._save_embedding_space_metadata(current_embedding_space)

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
        normalized_type = self._maybe_normalize_memory_type(memory_type_value)
        return normalized_type or "semantic"

    def _maybe_normalize_memory_type(self, memory_type_value: Any) -> Optional[str]:
        normalized_value = getattr(memory_type_value, "value", memory_type_value)
        normalized_text = str(normalized_value).strip().lower()
        if normalized_text == "episodic":
            return "episodic"
        if normalized_text == "semantic":
            return "semantic"
        return None

    @staticmethod
    def _should_embed_episodic_entry(
        *,
        record_kind: Optional[str],
        role: Optional[str],
        message_type: Optional[str],
    ) -> bool:
        return should_embed_episodic_entry(
            record_kind=record_kind,
            role=role,
            message_type=message_type,
        )

    async def _repair_index_mapping_mismatch(self, memory_type: str) -> None:
        """Rebuild when SQLite embedding IDs and FAISS vector count drift apart."""
        attrs = self._get_memory_attrs(memory_type)
        index = getattr(self, attrs.index)
        vector_id_to_memory_id = getattr(self, attrs.vector_id_to_memory_id)
        mapped_count = len(vector_id_to_memory_id)
        index_count = getattr(index, "ntotal", 0) if index is not None else 0
        if mapped_count == 0 or index_count == mapped_count:
            return

        logger.warning(
            "%s FAISS index/vector mapping mismatch detected "
            "(index vectors: %s, mapped rows: %s). Rebuilding index...",
            memory_type.capitalize(),
            index_count,
            mapped_count,
        )
        if self._embedding_service_unavailable():
            logger.info(
                "Skipping %s index mismatch repair because embedding service is unavailable",
                memory_type,
            )
            return
        await self._rebuild_index(memory_type)

    async def _rebuild_index(self, memory_type: str) -> bool:
        """Rebuild FAISS index from database for a given memory type."""
        (
            db_path,
            _,
            vector_id_to_memory_id,
            memory_id_to_vector_id,
            _,
        ) = self._get_memory_state(memory_type)

        previous_index = self._get_memory_state(memory_type)[1]
        previous_vector_id_to_memory_id = dict(vector_id_to_memory_id)
        previous_memory_id_to_vector_id = dict(memory_id_to_vector_id)
        previous_next_vector_id = self._get_memory_state(memory_type)[4]

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
            await cursor.execute("""
                SELECT id, content
                FROM memories
                WHERE embedding_id IS NOT NULL
                ORDER BY embedding_id ASC, id ASC
                """)
            rows = await cursor.fetchall()

            for memory_id, content in rows:
                if not content:
                    await cursor.execute(
                        "UPDATE memories SET embedding_id = NULL WHERE id = ?",
                        (memory_id,),
                    )
                    continue

                # Generate embedding
                try:
                    embedding = await self.embedder.embed_text(content)
                except EmbeddingServiceUnavailableError:
                    logger.info(
                        "Stopping index rebuild because embedding service is unavailable"
                    )
                    self._set_memory_index(memory_type, previous_index)
                    vector_id_to_memory_id.clear()
                    vector_id_to_memory_id.update(previous_vector_id_to_memory_id)
                    memory_id_to_vector_id.clear()
                    memory_id_to_vector_id.update(previous_memory_id_to_vector_id)
                    self._set_next_vector_id(memory_type, previous_next_vector_id)
                    return False
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
        return True

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
            record_kind: Optional source kind for memory rows
            role: Optional role metadata for memory rows
            message_index: Optional per-conversation ordering index
            message_type: Optional message type (e.g. "llm-text", "tool-call", "tool-output")
            tool_name: Optional tool name for tool-related entries
            correlation_id: Optional correlation id for tool calls/outputs
            model_id: Optional model id metadata
            model_provider: Optional model provider metadata
            screenshot: Optional screenshot metadata
            skip_embedding: Skip embedding/FAISS indexing
            timestamp: Optional ISO timestamp to store (defaults to now)

        Returns:
            Memory ID string
        """
        surrogate_paths = find_surrogate_paths(
            {
                "text": text,
                "user_id": user_id,
                "metadata": metadata,
                "conversation_id": conversation_id,
                "record_kind": record_kind,
                "role": role,
                "message_type": message_type,
                "tool_name": tool_name,
                "correlation_id": correlation_id,
                "model_id": model_id,
                "model_provider": model_provider,
            },
            root="local_store.add",
        )
        if surrogate_paths:
            logger.warning(
                "Lone surrogate reached LocalMemoryStore.add fields: %s",
                ", ".join(surrogate_paths),
            )

        text = sanitize_surrogates_in_text(text)
        user_id = sanitize_surrogates_in_text(user_id)
        conversation_id = (
            sanitize_surrogates_in_text(conversation_id)
            if conversation_id
            else conversation_id
        )
        record_kind = sanitize_surrogates_in_text(record_kind)
        role = sanitize_surrogates_in_text(role) if role else role
        message_type = (
            sanitize_surrogates_in_text(message_type) if message_type else message_type
        )
        tool_name = sanitize_surrogates_in_text(tool_name) if tool_name else tool_name
        correlation_id = (
            sanitize_surrogates_in_text(correlation_id)
            if correlation_id
            else correlation_id
        )
        model_id = sanitize_surrogates_in_text(model_id) if model_id else model_id
        model_provider = (
            sanitize_surrogates_in_text(model_provider)
            if model_provider
            else model_provider
        )
        screenshot = (
            sanitize_surrogates_in_text(screenshot) if screenshot else screenshot
        )
        metadata = sanitize_surrogates(metadata) if metadata else metadata

        memory_id = str(uuid.uuid4())
        timestamp_value = self._normalize_timestamp(timestamp)

        # Extract memory type from metadata.
        memory_type_str = metadata.get("type", "episodic") if metadata else "episodic"

        # Extract conversation_id from metadata if not provided directly
        if conversation_id is None and metadata:
            conversation_id = metadata.get("conversation_id")

        # Convert string to enum for type safety
        memory_type = self._normalize_memory_type(memory_type_str)

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
            try:
                embedding = await self.embedder.embed_text(text)
                await self._ensure_runtime_embedding_space_alignment()
                embedding = embedding.reshape(1, -1)
                faiss.normalize_L2(embedding)

                # Route to appropriate database and index
                vector_id = next_vector_id
                self._set_next_vector_id(memory_type, next_vector_id + 1)

                # Add to FAISS index
                index.add(embedding)
            except EmbeddingServiceUnavailableError:
                logger.info(
                    "Storing memory without vector index because embedding service is unavailable"
                )

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
        if (
            not skip_embedding
            and vector_id is not None
            and vector_id_to_memory_id is not None
            and memory_id_to_vector_id is not None
        ):
            vector_id_to_memory_id[vector_id] = memory_id
            memory_id_to_vector_id[memory_id] = vector_id

        # Save FAISS indices after each addition to ensure persistence
        if not skip_embedding and vector_id is not None:
            await self._save_faiss_indices()

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
        try:
            query_embedding = await self.embedder.embed_text(query)
        except EmbeddingServiceUnavailableError:
            logger.info(
                "Skipping memory search because embedding service is unavailable"
            )
            return []
        await self._ensure_runtime_embedding_space_alignment()
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

    async def search_by_embedding(
        self,
        embedding: List[float],
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 10,
        embedding_space_version: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Search memories using a caller-provided query embedding."""
        search_episodic = True
        search_semantic = True

        if filters:
            memory_type_filter = filters.get("metadata.type") or filters.get("type")
            normalized_type = self._maybe_normalize_memory_type(memory_type_filter)
            if normalized_type == "episodic":
                search_semantic = False
            elif normalized_type == "semantic":
                search_episodic = False

        search_targets = self._build_search_targets(search_episodic, search_semantic)
        if not search_targets:
            logger.debug("Skipping memory search: no searchable indices")
            return []

        query_embedding = np.asarray(embedding, dtype=np.float32)
        if query_embedding.ndim != 1 or query_embedding.size == 0:
            raise ValueError("embedding must be a non-empty float array")

        persisted_embedding_space = (
            getattr(self, "_embedding_space_metadata", None)
            or self._load_embedding_space_metadata()
        )
        if (
            embedding_space_version
            and persisted_embedding_space is not None
            and persisted_embedding_space.embedding_space_version
            != embedding_space_version
        ):
            logger.info(
                "External embedding space changed from %s to %s; refreshing local indices",
                persisted_embedding_space.embedding_space_version,
                embedding_space_version,
            )
            await self.embedder.refresh_embedding_space()
            await self._ensure_runtime_embedding_space_alignment()

        for memory_type, _, index, _ in search_targets:
            index_dimension = self._index_dimension(index)
            if index_dimension is not None and index_dimension != query_embedding.size:
                logger.warning(
                    "Skipping %s memory search: query embedding dimension %s does not match index dimension %s",
                    memory_type,
                    query_embedding.size,
                    index_dimension,
                )
                return []

        query_embedding = query_embedding.reshape(1, -1)
        faiss.normalize_L2(query_embedding)

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

            search_targets.append((memory_type, db_path, index, vector_id_to_memory_id))

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
            include_memory_context=(memory_type == "episodic"),
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
        result = {
            "id": row["id"],
            "text": row["content"],
            "metadata": metadata,
            "score": float(similarity),
            "timestamp": row["timestamp"],
            "type": memory_type,
            "conversation_id": row.get("conversation_id"),
        }
        if memory_type == "episodic":
            result["record_kind"] = row.get("record_kind")
            result["role"] = row.get("role")
            result["message_index"] = row.get("message_index")
            result["message_type"] = row.get("message_type")
        return result

    async def _fetch_rows_map(
        self,
        db_path: str,
        memory_ids: List[str],
        include_conversation_id: bool = False,
        include_memory_context: bool = False,
    ) -> Dict[str, Dict[str, Any]]:
        async with aiosqlite.connect(db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()

            placeholders = ",".join(["?"] * len(memory_ids))
            select_columns = "id, user_id, content, timestamp, metadata"
            if include_conversation_id:
                select_columns += ", conversation_id"
            if include_memory_context:
                select_columns += ", record_kind, role, message_index, message_type"
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

    def _parse_metadata(
        self, raw_metadata: Optional[str], memory_type: str
    ) -> Dict[str, Any]:
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
                "episodic": (
                    self.episodic_index.ntotal
                    if hasattr(self.episodic_index, "ntotal")
                    else 0
                ),
                "semantic": (
                    self.semantic_index.ntotal
                    if hasattr(self.semantic_index, "ntotal")
                    else 0
                ),
            },
        }

    async def get_user_ids_with_unsemanticized_memories(
        self, limit: int = 100
    ) -> List[str]:
        """
        Return distinct user IDs that have unsemanticized episodic interaction memories.
        """
        return await fetch_users_with_unsemanticized_memories(
            episodic_db_path=self.episodic_db_path,
            limit=limit,
        )

    async def count_unsemanticized_interaction_memories(
        self,
        user_id: Optional[str] = None,
    ) -> int:
        """
        Count unsemanticized episodic interaction rows.

        Args:
            user_id: Optional user filter.
        """
        return await fetch_unsemanticized_interaction_count(
            episodic_db_path=self.episodic_db_path,
            user_id=user_id,
        )

    async def semantic_summary_exists(self, summary_hash: str) -> bool:
        """
        Check if a semantic summary with the given hash already exists.
        """
        return await check_semantic_summary_exists(
            semantic_db_path=self.semantic_db_path,
            summary_hash=summary_hash,
        )

    async def append_chat_event(
        self,
        *,
        user_id: str,
        conversation_id: Optional[str],
        event_type: str,
        role: Optional[str],
        content: str,
        timestamp: Optional[str],
        message_index: Optional[int],
        revision_id: Optional[str],
        turn_ref: Optional[str],
        tool_name: Optional[str],
        correlation_id: Optional[str],
        workspace_path: Optional[str],
        workspace_name: Optional[str],
        metadata: Optional[Dict[str, Any]],
        attachments: Optional[List[Any]],
        event_payload: Dict[str, Any],
        compaction_checkpoint: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        stored = await append_chat_event(
            db_path=self.episodic_db_path,
            user_id=user_id,
            conversation_id=conversation_id,
            event_type=event_type,
            role=role,
            content=content,
            timestamp=timestamp,
            message_index=message_index,
            revision_id=revision_id,
            turn_ref=turn_ref,
            tool_name=tool_name,
            correlation_id=correlation_id,
            workspace_path=workspace_path,
            workspace_name=workspace_name,
            metadata=metadata,
            attachments=attachments,
            event_payload=event_payload,
            compaction_checkpoint=compaction_checkpoint,
        )
        self._schedule_conversation_title_generation(
            user_id=user_id,
            conversation_id=conversation_id,
            role=role,
            event_type=event_type,
            content=content,
            metadata=metadata,
            event_payload=event_payload,
        )
        return stored

    async def list_chat_conversations(
        self, user_id: str, limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return await list_chat_conversations(
            db_path=self.episodic_db_path,
            user_id=user_id,
            limit=limit,
        )

    async def replace_chat_conversation(
        self,
        *,
        user_id: str,
        conversation_id: Optional[str],
        events: List[Dict[str, Any]],
        revision_id: Optional[str] = None,
        revision_updated_at: Optional[str] = None,
    ) -> Dict[str, int]:
        result = await replace_chat_conversation(
            db_path=self.episodic_db_path,
            user_id=user_id,
            conversation_id=conversation_id,
            events=events,
            revision_id=revision_id,
            revision_updated_at=revision_updated_at,
        )
        for event in events:
            self._schedule_conversation_title_generation(
                user_id=user_id,
                conversation_id=conversation_id,
                role=event.get("role"),
                event_type=str(event.get("event_type") or ""),
                content=str(event.get("content") or ""),
                metadata=(
                    event.get("metadata")
                    if isinstance(event.get("metadata"), dict)
                    else {}
                ),
                event_payload=(
                    event.get("event_payload")
                    if isinstance(event.get("event_payload"), dict)
                    else {}
                ),
            )
        return result

    async def rewrite_chat_conversation_after_event(
        self,
        *,
        user_id: str,
        conversation_id: Optional[str],
        cut_after_event_id: Optional[str],
        event: Dict[str, Any],
        revision_id: Optional[str] = None,
        revision_updated_at: Optional[str] = None,
    ) -> Dict[str, int]:
        result = await rewrite_chat_conversation_after_event(
            db_path=self.episodic_db_path,
            user_id=user_id,
            conversation_id=conversation_id,
            cut_after_event_id=cut_after_event_id,
            event=event,
            revision_id=revision_id,
            revision_updated_at=revision_updated_at,
        )
        self._schedule_conversation_title_generation(
            user_id=user_id,
            conversation_id=conversation_id,
            role=event.get("role"),
            event_type=str(event.get("event_type") or ""),
            content=str(event.get("content") or ""),
            metadata=(
                event.get("metadata")
                if isinstance(event.get("metadata"), dict)
                else {}
            ),
            event_payload=(
                event.get("event_payload")
                if isinstance(event.get("event_payload"), dict)
                else {}
            ),
        )
        return result

    async def get_chat_conversation_revision(
        self,
        user_id: str,
        conversation_id: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        return await get_chat_conversation_revision(
            db_path=self.episodic_db_path,
            user_id=user_id,
            conversation_id=conversation_id,
        )

    async def search_chat_conversations(
        self, user_id: str, query: str, limit: int = 40
    ) -> List[Dict[str, Any]]:
        return await search_chat_conversations(
            db_path=self.episodic_db_path,
            user_id=user_id,
            query=query,
            limit=limit,
        )

    def _schedule_conversation_title_generation(
        self,
        *,
        user_id: str,
        conversation_id: Optional[str],
        role: Optional[str],
        event_type: str,
        content: str,
        metadata: Optional[Dict[str, Any]],
        event_payload: Dict[str, Any],
    ) -> None:
        if not self._is_title_generation_trigger(
            conversation_id=conversation_id,
            role=role,
            event_type=event_type,
            content=content,
            event_payload=event_payload,
        ):
            return

        key = (user_id, conversation_id or "")
        existing_task = self._title_generation_tasks.get(key)
        if existing_task and not existing_task.done():
            return

        task = asyncio.create_task(
            self._generate_conversation_title_for_exchange(
                user_id=user_id,
                conversation_id=conversation_id or "",
                metadata=metadata or {},
            )
        )
        self._title_generation_tasks[key] = task
        task.add_done_callback(
            lambda completed_task, task_key=key: self._title_generation_tasks.pop(
                task_key, None
            )
        )

    @staticmethod
    def _is_title_generation_trigger(
        *,
        conversation_id: Optional[str],
        role: Optional[str],
        event_type: str,
        content: str,
        event_payload: Dict[str, Any],
    ) -> bool:
        if not conversation_id or not isinstance(content, str) or not content.strip():
            return False
        if (role or "").strip().lower() != "assistant":
            return False
        if (event_type or "").strip().lower() != "assistant_message":
            return False
        payload = (
            event_payload.get("payload") if isinstance(event_payload, dict) else {}
        )
        message_type = (
            payload.get("messageType")
            or payload.get("message_type")
            or event_payload.get("messageType")
            or event_payload.get("message_type")
        )
        return str(message_type or "llm-text").strip().lower() == "llm-text"

    async def _generate_conversation_title_for_exchange(
        self,
        *,
        user_id: str,
        conversation_id: str,
        metadata: Dict[str, Any],
    ) -> None:
        try:
            async with self._title_generation_semaphore:
                title_state = await get_conversation_title_state(
                    db_path=self.episodic_db_path,
                    user_id=user_id,
                    conversation_id=conversation_id,
                )
                if title_state.get("is_locked"):
                    return
                existing_source = str(title_state.get("source") or "").strip()
                if title_state.get("title") and existing_source not in {
                    "",
                    "heuristic",
                }:
                    return

                exchange = await get_first_title_exchange(
                    db_path=self.episodic_db_path,
                    user_id=user_id,
                    conversation_id=conversation_id,
                )
                user_message = exchange.get("user_message", "")
                assistant_message = exchange.get("assistant_message", "")
                if not user_message or not assistant_message:
                    return

                title = await self.title_client.generate_title(
                    user_id=user_id,
                    user_message=user_message,
                    assistant_message=assistant_message,
                    model_id=self._extract_metadata_string(metadata, "model_id"),
                    model_provider=self._extract_metadata_string(
                        metadata, "model_provider"
                    ),
                )
                if not title:
                    return
                await upsert_generated_conversation_title(
                    db_path=self.episodic_db_path,
                    user_id=user_id,
                    conversation_id=conversation_id,
                    title=title,
                )
                await self._emit_conversation_title_updated(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    title=title,
                )
        except Exception as exc:
            logger.warning(
                "Conversation title generation failed for user_id=%s conversation_id=%s: %s",
                user_id,
                conversation_id,
                exc,
            )

    async def _emit_conversation_title_updated(
        self, *, user_id: str, conversation_id: str, title: str
    ) -> None:
        if self._event_sink is None:
            return
        try:
            await self._event_sink(
                {
                    "type": "conversation-title-updated",
                    "payload": {
                        "user_id": user_id,
                        "conversation_id": conversation_id,
                        "title": title,
                        "source": "model",
                    },
                }
            )
        except Exception as exc:
            logger.warning(
                "Failed to emit conversation title update for user_id=%s conversation_id=%s: %s",
                user_id,
                conversation_id,
                exc,
            )

    @staticmethod
    def _extract_metadata_string(metadata: Dict[str, Any], key: str) -> Optional[str]:
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        return None

    async def _cancel_title_generation_tasks(self) -> None:
        tasks = [
            task for task in self._title_generation_tasks.values() if not task.done()
        ]
        self._title_generation_tasks.clear()
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task

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
                results.append(
                    {
                        "id": row["id"],
                        "content": row["content"],
                        "timestamp": row["timestamp"],
                        "metadata": self._parse_raw_metadata(row["metadata"]),
                    }
                )

            return results

    async def list_episodic_memories(
        self, user_id: str, limit: int = 200
    ) -> List[Dict[str, Any]]:
        """
        List completed-turn interaction memories for a user.

        This powers the memory panel's episodic tab, while transcript and replay rows stay
        in the chat-history domain.
        """
        async with aiosqlite.connect(self.episodic_db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.cursor()
            await cursor.execute(
                """
                SELECT id, content, timestamp, metadata, conversation_id, record_kind
                FROM memories
                WHERE user_id = ? AND COALESCE(record_kind, '') = ?
                ORDER BY timestamp DESC
                LIMIT ?
            """,
                (user_id, INTERACTION_RECORD_KIND, limit),
            )
            rows = await cursor.fetchall()

            results = []
            for row in rows:
                parsed_metadata = self._parse_raw_metadata(row["metadata"])
                results.append(
                    {
                        "id": row["id"],
                        "content": row["content"],
                        "timestamp": row["timestamp"],
                        "metadata": parsed_metadata,
                        "conversation_id": row["conversation_id"],
                        "record_kind": row["record_kind"]
                        or parsed_metadata.get("record_kind"),
                    }
                )

            return results

    async def delete_episodic_memory(self, user_id: str, memory_id: str) -> bool:
        """
        Delete a completed-turn interaction memory entry by ID for a given user.

        Transcript and replay rows are intentionally excluded from this path;
        chat-history deletions should continue through conversation-level deletion.
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
                WHERE id = ? AND user_id = ? AND COALESCE(record_kind, '') = ?
            """,
                (memory_id, user_id, INTERACTION_RECORD_KIND),
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
                WHERE id = ? AND user_id = ? AND COALESCE(record_kind, '') = ?
            """,
                (memory_id, user_id, INTERACTION_RECORD_KIND),
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

    async def clear_local_memory(self, user_id: str) -> Dict[str, int]:
        return await clear_local_memory_admin(self, user_id=user_id)

    async def clear_chat_history(self, user_id: str) -> Dict[str, int]:
        return await clear_chat_history_admin(self, user_id=user_id)

    async def clear_chat_events(self, user_id: str) -> int:
        return await clear_chat_events(db_path=self.episodic_db_path, user_id=user_id)

    async def delete_chat_conversation(
        self, user_id: str, conversation_id: Optional[str]
    ) -> int:
        return await delete_chat_conversation(
            db_path=self.episodic_db_path,
            user_id=user_id,
            conversation_id=conversation_id,
        )

    async def _cleanup_index_artifacts_if_empty(self, memory_type: str) -> None:
        """
        Drop in-memory/disk FAISS artifacts when a memory type has no indexed rows left.

        This ensures "delete everything" workflows also remove persisted vector artifacts.
        """
        db_path, _, vector_id_to_memory_id, memory_id_to_vector_id, _ = (
            self._get_memory_state(memory_type)
        )

        index_path = (
            self.episodic_index_path
            if memory_type == "episodic"
            else self.semantic_index_path
        )

        cleanup_result = await cleanup_index_artifacts_if_empty(
            memory_type=memory_type,
            db_path=db_path,
            index_path=index_path,
            embedding_dimension=self.embedder.dimension,
            faiss_module=faiss,
            vector_id_to_memory_id=vector_id_to_memory_id,
            memory_id_to_vector_id=memory_id_to_vector_id,
        )
        if cleanup_result is None:
            return

        self._set_memory_index(memory_type, cleanup_result.empty_index)
        self._set_next_vector_id(memory_type, 0)

    async def get_next_chat_event_index(
        self, user_id: str, conversation_id: Optional[str]
    ) -> int:
        return await get_next_chat_event_index(
            db_path=self.episodic_db_path,
            user_id=user_id,
            conversation_id=conversation_id,
        )

    async def get_chat_events(
        self,
        user_id: str,
        conversation_id: Optional[str],
        limit: int = 1000,
        after_message_index: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        return await get_chat_events(
            db_path=self.episodic_db_path,
            user_id=user_id,
            conversation_id=conversation_id,
            limit=limit,
            after_message_index=after_message_index,
        )

    async def get_unsemanticized_conversation_windows(self, user_id: str) -> List[str]:
        """
        Get list of conversation_id values that have unsummarized memories.
        Returns conversation windows ordered by the earliest unsummarized memory timestamp.

        Args:
            user_id: User identifier

        Returns:
            List of conversation_id strings (None values are treated as separate windows)
        """
        return await fetch_unsemanticized_conversation_windows(
            episodic_db_path=self.episodic_db_path,
            user_id=user_id,
        )

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
        return await fetch_unsemanticized_episodic_by_conversation(
            episodic_db_path=self.episodic_db_path,
            user_id=user_id,
            conversation_id=conversation_id,
            limit=limit,
            format_transcript_rows=self._format_transcript_rows,
        )

    @staticmethod
    def _conversation_where_clause(
        conversation_id: Optional[str],
    ) -> Tuple[str, Tuple[Any, ...]]:
        return conversation_where_clause(conversation_id)

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
        return await fetch_unsemanticized_episodic_memories(
            episodic_db_path=self.episodic_db_path,
            user_id=user_id,
            limit=limit,
            format_transcript_rows=self._format_transcript_rows,
        )

    async def mark_episodic_memories_semanticized(
        self,
        memory_ids: List[str],
        metadata_patch: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Mark episodic memories as semanticized.

        Args:
            memory_ids: List of memory IDs to mark as processed
        """
        await mark_semanticized_memories_runtime(
            episodic_db_path=self.episodic_db_path,
            memory_ids=memory_ids,
            metadata_patch=metadata_patch,
            log_debug=logger.debug,
        )

    async def get_watermark(self) -> Dict[str, Any]:
        """
        Get current watermark state.

        Returns:
            Dictionary with 'last_semanticized_id' and 'pending_message_count'
        """
        return await self._watermark_store.get()

    async def update_watermark(
        self, last_semanticized_id: Optional[str], pending_message_count: int = 0
    ) -> None:
        """
        Update watermark state.

        Args:
            last_semanticized_id: ID of the last processed episodic memory (None if none processed)
            pending_message_count: Number of pending messages since last batch
        """
        await self._watermark_store.update(last_semanticized_id, pending_message_count)
        logger.debug(
            f"Updated watermark: last_id={last_semanticized_id}, pending={pending_message_count}"
        )

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
        return await fetch_unprocessed_memories_after_id(
            episodic_db_path=self.episodic_db_path,
            last_id=last_id,
            user_id=user_id,
            limit=limit,
            format_transcript_rows=self._format_transcript_rows,
        )

    def _format_transcript_rows(
        self,
        rows: List[Dict[str, Any]],
        *,
        include_conversation_id: bool,
    ) -> List[Dict[str, Any]]:
        return format_transcript_rows(
            rows=rows,
            include_conversation_id=include_conversation_id,
            parse_raw_metadata=self._parse_raw_metadata,
        )
