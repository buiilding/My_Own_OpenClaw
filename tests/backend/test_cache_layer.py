"""Covers cache layer behavior in the backend test suite."""

from backend.src.core.infrastructure.cache_store import Cache
import backend.src.core.infrastructure.cache_store as cache_store_module


def test_cache_set_get_and_expire(monkeypatch):
    now = {"value": 1000.0}

    def fake_time():
        return now["value"]

    monkeypatch.setattr(cache_store_module.time, "time", fake_time)
    cache = Cache(default_ttl=10.0)

    cache.set("a", 1, ttl=5.0)
    assert cache.get("a") == 1

    now["value"] = 1006.0
    assert cache.get("a") is None


def test_cache_get_returns_cached_none_without_counting_as_miss():
    cache = Cache(default_ttl=10.0)

    cache.set("key", None)

    assert cache.get("key") is None
    assert cache.get_stats()["hits"] == 1


def test_cache_lru_eviction_keeps_recently_read_key():
    cache = Cache(default_ttl=10.0, max_size=2)

    cache.set("a", 1)
    cache.set("b", 2)
    assert cache.get("a") == 1
    cache.set("c", 3)

    assert cache.get("a") == 1
    assert cache.get("b") is None
    assert cache.get("c") == 3


def test_cache_delete_and_cleanup_expired(monkeypatch):
    now = {"value": 1000.0}

    def fake_time():
        return now["value"]

    monkeypatch.setattr(cache_store_module.time, "time", fake_time)
    cache = Cache(default_ttl=10.0)

    cache.set("a", 1, ttl=2.0)
    cache.set("b", 2, ttl=20.0)
    assert cache.delete("missing") is False
    assert cache.delete("b") is True
    assert cache.get("b") is None

    now["value"] = 1003.0
    assert cache.cleanup_expired() == 1
    assert cache.get_stats()["size"] == 0
