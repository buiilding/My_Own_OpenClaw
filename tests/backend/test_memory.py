"""
Unit tests for the local memory system.

Tests cover LocalMemoryStore, SemanticRetrieval, MemorySummarizer, and MemoryManager.
"""
import os
import tempfile
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from backend.config import AppConfig
from backend.memory.local_store import LocalMemoryStore
from backend.memory.retrieval import SemanticRetrieval
from backend.memory.memory_manager import MemoryManager
from backend.memory.schemas import EpisodicMemory, SemanticMemory


@pytest.fixture
def temp_db_path():
    """Create a temporary database path for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield str(Path(tmpdir) / "test_memories.db")


@pytest.fixture
def memory_store(temp_db_path):
    """Create a LocalMemoryStore instance for testing."""
    store = LocalMemoryStore(db_path=temp_db_path, embedding_model="all-MiniLM-L6-v2")
    yield store
    # Cleanup is handled by tempfile


@pytest.fixture
def app_config():
    """Create a test AppConfig instance."""
    return AppConfig(
        memory_enabled=True,
        memory_db_path=None,  # Will use default
        embedding_model="all-MiniLM-L6-v2",
        summarization_interval=3600
    )


class TestLocalMemoryStore:
    """Tests for LocalMemoryStore."""

    def test_add_memory(self, memory_store):
        """Test adding a memory entry."""
        memory_id = memory_store.add(
            text="User likes Python programming",
            user_id="test_user",
            metadata={"type": "semantic", "source": "test"}
        )

        assert memory_id is not None
        assert isinstance(memory_id, str)

    def test_search_memories(self, memory_store):
        """Test searching memories."""
        # Add some test memories
        memory_store.add(
            text="User prefers Python over JavaScript",
            user_id="test_user",
            metadata={"type": "semantic"}
        )
        memory_store.add(
            text="User asked about file operations",
            user_id="test_user",
            metadata={"type": "episodic"}
        )

        # Search for Python-related memories
        results = memory_store.search(
            query="Python programming",
            user_id="test_user",
            limit=5
        )

        assert len(results) > 0
        assert any("Python" in result['text'] for result in results)

    def test_search_with_filters(self, memory_store):
        """Test searching with metadata filters."""
        # Add memories of different types
        memory_store.add(
            text="User asked about Python",
            user_id="test_user",
            metadata={"type": "episodic"}
        )
        memory_store.add(
            text="User prefers Python",
            user_id="test_user",
            metadata={"type": "semantic"}
        )

        # Filter by type
        results = memory_store.search(
            query="Python",
            user_id="test_user",
            filters={"metadata.type": "semantic"},
            limit=5
        )

        assert len(results) > 0
        assert all(result['type'] == "semantic" for result in results)

    def test_update_memory(self, memory_store):
        """Test updating memory metadata."""
        memory_id = memory_store.add(
            text="Test memory",
            user_id="test_user",
            metadata={"type": "episodic", "summarized": "false"}
        )

        # Update metadata
        success = memory_store.update(
            memory_id,
            metadata={"summarized": "true"}
        )

        assert success is True

        # Verify update
        results = memory_store.search(
            query="Test memory",
            user_id="test_user",
            limit=1
        )

        assert len(results) > 0
        assert results[0]['metadata'].get("summarized") == "true"

    def test_delete_memory(self, memory_store):
        """Test deleting a memory."""
        memory_id = memory_store.add(
            text="Memory to delete",
            user_id="test_user",
            metadata={"type": "episodic"}
        )

        # Delete memory
        success = memory_store.delete(memory_id)
        assert success is True

        # Verify deletion
        results = memory_store.search(
            query="Memory to delete",
            user_id="test_user",
            limit=1
        )

        assert len(results) == 0

    def test_get_stats(self, memory_store):
        """Test getting memory statistics."""
        # Add some memories
        memory_store.add(
            text="Episodic memory 1",
            user_id="test_user",
            metadata={"type": "episodic"}
        )
        memory_store.add(
            text="Semantic memory 1",
            user_id="test_user",
            metadata={"type": "semantic"}
        )

        stats = memory_store.get_stats(user_id="test_user")

        assert stats['total_count'] >= 2
        assert 'episodic' in stats['by_type']
        assert 'semantic' in stats['by_type']


class TestSemanticRetrieval:
    """Tests for SemanticRetrieval."""

    def test_semantic_search(self, memory_store):
        """Test semantic search."""
        retrieval = SemanticRetrieval(memory_store)

        # Add test memories
        memory_store.add(
            text="User prefers AWS for cloud hosting",
            user_id="test_user",
            metadata={"type": "semantic"}
        )
        memory_store.add(
            text="User asked about deployment options",
            user_id="test_user",
            metadata={"type": "episodic"}
        )

        results = retrieval.semantic_search(
            query="cloud hosting preferences",
            user_id="test_user",
            memory_type="semantic",
            limit=5
        )

        assert len(results) > 0
        assert any("AWS" in result['text'] for result in results)

    def test_temporal_search(self, memory_store):
        """Test temporal search."""
        retrieval = SemanticRetrieval(memory_store)

        # Add memories
        memory_store.add(
            text="Recent interaction",
            user_id="test_user",
            metadata={"type": "episodic"}
        )

        from datetime import datetime, timedelta
        results = retrieval.temporal_search(
            user_id="test_user",
            start_time=datetime.now() - timedelta(days=1),
            end_time=datetime.now(),
            limit=10
        )

        assert len(results) >= 1

    def test_hybrid_search(self, memory_store):
        """Test hybrid search combining semantic and episodic."""
        retrieval = SemanticRetrieval(memory_store)

        # Add test memories
        memory_store.add(
            text="User prefers Python",
            user_id="test_user",
            metadata={"type": "semantic"}
        )
        memory_store.add(
            text="User asked about Python yesterday",
            user_id="test_user",
            metadata={"type": "episodic"}
        )

        results = retrieval.hybrid_search(
            query="Python",
            user_id="test_user",
            limit=5
        )

        assert "semantic" in results
        assert "episodic" in results
        assert len(results["semantic"]) > 0 or len(results["episodic"]) > 0


class TestMemoryManager:
    """Tests for MemoryManager."""

    def test_store_episodic_memory(self, app_config, temp_db_path):
        """Test storing episodic memory."""
        app_config.memory_db_path = temp_db_path

        manager = MemoryManager(
            user_id="test_user",
            session_id="test_session",
            cfg=app_config
        )

        manager.store_episodic_memory(
            user_message="Hello",
            assistant_reply="Hi there!"
        )

        # Verify memory was stored
        results = manager.memory_store.search(
            query="Hello",
            user_id="test_user",
            limit=1
        )

        assert len(results) > 0

    def test_retrieve_memories(self, app_config, temp_db_path):
        """Test retrieving memories."""
        app_config.memory_db_path = temp_db_path

        manager = MemoryManager(
            user_id="test_user",
            session_id="test_session",
            cfg=app_config
        )

        # Add some memories
        manager.memory_store.add(
            text="User prefers Python",
            user_id="test_user",
            metadata={"type": "semantic"}
        )

        memories = manager.retrieve_memories(query="Python", limit=5)

        assert "semantic" in memories
        assert "episodic" in memories

    def test_format_context(self, app_config):
        """Test formatting memories for context."""
        app_config.memory_enabled = False  # Disable to avoid DB initialization

        manager = MemoryManager(
            user_id="test_user",
            session_id="test_session",
            cfg=app_config
        )

        # Test with empty memories
        context = manager.format_context({"semantic": [], "episodic": []})
        assert context == ""

        # Test with memories
        memories = {
            "semantic": ["User prefers Python", "User likes AWS"],
            "episodic": ["Recent interaction"]
        }
        context = manager.format_context(memories)

        assert "[Semantic Memory]" in context
        assert "[Recent Interactions]" in context
        assert "Python" in context

    @pytest.mark.asyncio
    async def test_summarize_and_store_semantic_memory(self, app_config, temp_db_path):
        """Test summarization of episodic memories."""
        app_config.memory_db_path = temp_db_path

        manager = MemoryManager(
            user_id="test_user",
            session_id="test_session",
            cfg=app_config
        )

        # Add some episodic memories
        manager.store_episodic_memory(
            user_message="I prefer Python over JavaScript",
            assistant_reply="Noted, you prefer Python."
        )
        manager.store_episodic_memory(
            user_message="I work at Company X",
            assistant_reply="Got it, you work at Company X."
        )

        # Mock the LLM client to return predictable facts
        with patch.object(manager.summarizer.llm_client, 'get_completion') as mock_llm:
            mock_llm.return_value = "User prefers Python\nUser works at Company X"

            count = await manager.summarize_and_store_semantic_memory()

            # Should have created semantic memories
            assert count > 0

            # Verify semantic memories were created
            semantic_results = manager.memory_store.search(
                query="preferences",
                user_id="test_user",
                filters={"metadata.type": "semantic"},
                limit=5
            )

            assert len(semantic_results) > 0


class TestMemorySchemas:
    """Tests for memory schema models."""

    def test_episodic_memory_schema(self):
        """Test EpisodicMemory schema."""
        memory = EpisodicMemory(
            user_id="test_user",
            session_id="test_session",
            content="Test content"
        )

        assert memory.type == "episodic"
        assert memory.user_id == "test_user"
        assert memory.session_id == "test_session"
        assert memory.content == "Test content"
        assert memory.timestamp is not None

    def test_semantic_memory_schema(self):
        """Test SemanticMemory schema."""
        memory = SemanticMemory(
            user_id="test_user",
            source_session_id="test_session",
            content="User prefers Python"
        )

        assert memory.type == "semantic"
        assert memory.user_id == "test_user"
        assert memory.source_session_id == "test_session"
        assert memory.content == "User prefers Python"
        assert memory.timestamp is not None
