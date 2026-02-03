from backend.src.core.infrastructure.cache import Cache
import backend.src.core.infrastructure.cache as cache_module


def test_cache_set_get_and_expire(monkeypatch):
    now = {"value": 1000.0}

    def fake_time():
        return now["value"]

    monkeypatch.setattr(cache_module.time, "time", fake_time)
    cache = Cache(default_ttl=10.0)

    cache.set("a", 1, ttl=5.0)
    assert cache.get("a") == 1

    now["value"] = 1006.0
    assert cache.get("a") is None


def test_cache_get_or_compute_called_once():
    cache = Cache(default_ttl=10.0)
    calls = {"count": 0}

    def compute():
        calls["count"] += 1
        return "value"

    assert cache.get_or_compute("key", compute) == "value"
    assert cache.get_or_compute("key", compute) == "value"
    assert calls["count"] == 1
