import time

import pytest

from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
from backend.src.core.interfaces.tool import ToolResult


@pytest.mark.asyncio
async def test_store_pending_and_future_resolution(monkeypatch):
    storage = ToolResultStorage()
    result = ToolResult(success=True, data={"ok": True})

    storage.store_pending_result("req-1", result)
    assert storage.get_pending_result("req-1") == result

    future = storage.create_result_future("req-1")
    assert storage.resolve_result_future("req-1", result) is True
    assert future.result() == result
    assert storage.get_result_future("req-1") is None

    assert storage.remove_pending_result("req-1") is True
    assert storage.get_pending_result("req-1") is None


def test_cleanup_old_results_removes_expired(monkeypatch):
    storage = ToolResultStorage(cleanup_ttl_seconds=1)
    result = ToolResult(success=True)

    storage.store_pending_result("req-old", result)
    storage._result_timestamps["req-old"] = 0

    storage.store_bundled_result("bundle-old", result)
    storage._bundle_timestamps["bundle-old"] = 0

    monkeypatch.setattr(time, "time", lambda: 5)
    cleaned = storage.cleanup_old_results(max_age_seconds=1)

    assert cleaned == 2
    assert storage.get_pending_result("req-old") is None
    assert storage.get_bundled_result("bundle-old") is None


def test_storage_stats_and_clear_all():
    storage = ToolResultStorage()
    storage.store_pending_result("req", ToolResult(success=True))
    storage.store_bundled_result("bundle", ToolResult(success=True))

    stats = storage.get_stats()
    assert stats["pending_results"] == 1
    assert stats["bundled_results"] == 1

    storage.clear_all()
    cleared = storage.get_stats()
    assert cleared["pending_results"] == 0
    assert cleared["bundled_results"] == 0


@pytest.mark.asyncio
async def test_bundle_future_resolution_and_cleanup():
    storage = ToolResultStorage()
    result = ToolResult(success=True, data={"ok": True})

    future = storage.create_bundle_future("bundle-1")
    assert storage.resolve_bundle_future("bundle-1", result) is True
    assert future.result() == result
    assert storage.get_bundle_future("bundle-1") is None
    assert storage.remove_bundle_future("bundle-1") is False


@pytest.mark.asyncio
async def test_cleanup_request_ids_removes_pending_and_futures():
    storage = ToolResultStorage()
    result = ToolResult(success=True)

    storage.store_pending_result("req-1", result)
    storage.create_result_future("req-1")

    cleaned = storage.cleanup_request_ids({"req-1"})
    assert cleaned == 2
    assert storage.get_pending_result("req-1") is None
    assert storage.get_result_future("req-1") is None


@pytest.mark.asyncio
async def test_cleanup_old_results_removes_expired_futures(monkeypatch):
    storage = ToolResultStorage(cleanup_ttl_seconds=1)
    result = ToolResult(success=True)

    storage.store_pending_result("req-old", result)
    storage.create_result_future("req-old")
    storage._result_timestamps["req-old"] = 0

    monkeypatch.setattr(time, "time", lambda: 5)
    cleaned = storage.cleanup_old_results(max_age_seconds=1)

    assert cleaned == 1
    assert storage.get_pending_result("req-old") is None
    assert storage.get_result_future("req-old") is None
