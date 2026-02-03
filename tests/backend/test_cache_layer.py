import asyncio
import threading

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


def test_cache_get_or_compute_waiters_complete():
    cache = Cache(default_ttl=10.0)
    started = threading.Event()
    proceed = threading.Event()
    results = []

    def compute():
        started.set()
        proceed.wait(timeout=2.0)
        return "value"

    def worker():
        results.append(cache.get_or_compute("key", compute))

    t1 = threading.Thread(target=worker)
    t2 = threading.Thread(target=worker)
    t1.start()
    t2.start()

    assert started.wait(timeout=1.0)
    proceed.set()

    t1.join(timeout=2.0)
    t2.join(timeout=2.0)

    assert results.count("value") == 2


def test_cache_get_or_compute_async_waiters_complete():
    cache = Cache(default_ttl=10.0)
    started = asyncio.Event()
    proceed = asyncio.Event()

    async def compute():
        started.set()
        await proceed.wait()
        return "value"

    async def runner():
        return await cache.get_or_compute_async("key", compute)

    async def run():
        task1 = asyncio.create_task(runner())
        task2 = asyncio.create_task(runner())
        await started.wait()
        proceed.set()
        results = await asyncio.gather(task1, task2)
        assert results == ["value", "value"]

    asyncio.run(run())
