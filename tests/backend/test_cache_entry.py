"""Tests for CacheEntry and CacheManager."""
import hashlib
import pytest
import time
from unittest.mock import patch

from backend.src.core.infrastructure.cache_entry import CacheEntry
from backend.src.core.infrastructure.cache_manager import CacheManager, cache_manager


class TestCacheEntry:
    """Tests for CacheEntry dataclass."""

    def test_init_basic(self):
        entry = CacheEntry(value="test", expires_at=1234.0)
        
        assert entry.value == "test"
        assert entry.expires_at == 1234.0
        assert entry.is_error is False

    def test_init_with_is_error(self):
        error = ValueError("test error")
        entry = CacheEntry(value=error, expires_at=1234.0, is_error=True)
        
        assert entry.value is error
        assert entry.is_error is True

    def test_created_at_default(self):
        before = time.time()
        entry = CacheEntry(value="test", expires_at=1234.0)
        after = time.time()
        
        assert before <= entry.created_at <= after

    def test_custom_created_at(self):
        custom_time = 1000.0
        entry = CacheEntry(value="test", expires_at=1234.0, created_at=custom_time)
        
        assert entry.created_at == custom_time


class TestCacheManager:
    """Tests for CacheManager class."""

    @pytest.fixture
    def manager(self):
        return CacheManager()

    def test_init(self, manager):
        assert manager.tool_schemas is not None
        assert manager.embeddings is not None
        assert manager.llm_clients is not None
        assert manager.generic is not None
        
        # Check default TTLs
        assert manager.tool_schemas.default_ttl == 3600.0
        assert manager.embeddings.default_ttl == 86400.0
        assert manager.llm_clients.default_ttl == 86400.0
        assert manager.generic.default_ttl == 3600.0

    def test_get_tool_schema_key(self, manager):
        key = manager.get_tool_schema_key("read_file")
        
        assert key == "tool_schema:read_file"

    def test_get_embedding_key(self, manager):
        text = "hello world"
        key = manager.get_embedding_key(text)
        
        expected_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        assert key == f"embedding:{expected_hash}"

    def test_get_embedding_key_is_deterministic(self, manager):
        text = "test text"
        key1 = manager.get_embedding_key(text)
        key2 = manager.get_embedding_key(text)
        
        assert key1 == key2

    def test_get_embedding_key_different_texts(self, manager):
        key1 = manager.get_embedding_key("text1")
        key2 = manager.get_embedding_key("text2")
        
        assert key1 != key2

    def test_get_llm_client_key(self, manager):
        key = manager.get_llm_client_key("config_hash_123")
        
        assert key == "llm_client:config_hash_123"

    def test_clear_all(self, manager):
        # Add some data to caches
        manager.tool_schemas.set("key1", "value1")
        manager.embeddings.set("key2", "value2")
        manager.llm_clients.set("key3", "value3")
        manager.generic.set("key4", "value4")
        
        manager.clear_all()
        
        assert manager.tool_schemas.get("key1") is None
        assert manager.embeddings.get("key2") is None
        assert manager.llm_clients.get("key3") is None
        assert manager.generic.get("key4") is None

    def test_get_stats(self, manager):
        # Add data to generate stats
        manager.tool_schemas.set("key1", "value1")
        manager.tool_schemas.get("key1")  # Hit
        manager.tool_schemas.get("key2")  # Miss
        
        stats = manager.get_stats()
        
        assert "tool_schemas" in stats
        assert "embeddings" in stats
        assert "llm_clients" in stats
        assert "generic" in stats
        
        tool_stats = stats["tool_schemas"]
        assert tool_stats["size"] == 1
        assert tool_stats["hits"] == 1
        assert tool_stats["misses"] == 1


class TestCacheManagerSingleton:
    """Tests for the cache_manager singleton."""

    def test_singleton_exists(self):
        assert cache_manager is not None
        assert isinstance(cache_manager, CacheManager)

    def test_singleton_same_instance(self):
        # Import again to verify it's the same instance
        from backend.src.core.infrastructure.cache_manager import cache_manager as cm2
        assert cache_manager is cm2
