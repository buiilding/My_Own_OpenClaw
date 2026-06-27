"""Covers local-runtime memory metrics and watermark state behavior."""

import json
import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import core.system_metrics as system_metrics_module  # noqa: E402
from memory.watermark_state import WatermarkStateStore  # noqa: E402


@pytest.fixture(autouse=True)
def use_default_executor(monkeypatch):
    # Keep tests deterministic by using the loop default executor.
    monkeypatch.setattr(
        "core.executors.get_background_executor",
        lambda max_workers=None: None,
    )
    monkeypatch.setattr(
        "core.executors.get_interactive_executor",
        lambda max_workers=None: None,
    )
    monkeypatch.setattr(
        system_metrics_module,
        "get_interactive_executor",
        lambda max_workers=None: None,
    )


def test_collect_system_stats_sync_reads_cpu_memory_and_battery(monkeypatch):
    fake_psutil = SimpleNamespace(
        cpu_percent=lambda interval: 12.5 if interval == 0.1 else 0.0,
        virtual_memory=lambda: SimpleNamespace(percent=41.2),
        sensors_battery=lambda: SimpleNamespace(percent=88, power_plugged=True),
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    stats = system_metrics_module._collect_system_stats_sync()

    assert stats == {
        "cpu_percent": 12.5,
        "memory_percent": 41.2,
        "battery_percent": 88,
        "battery_charging": True,
    }


def test_collect_system_stats_sync_handles_missing_battery_support(monkeypatch):
    def _raise_not_implemented():
        raise NotImplementedError("battery unsupported")

    fake_psutil = SimpleNamespace(
        cpu_percent=lambda interval=None: 5.0,
        virtual_memory=lambda: SimpleNamespace(percent=24.0),
        sensors_battery=_raise_not_implemented,
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    stats = system_metrics_module._collect_system_stats_sync()

    assert stats["cpu_percent"] == 5.0
    assert stats["memory_percent"] == 24.0
    assert stats["battery_percent"] is None
    assert stats["battery_charging"] is None


def test_collect_system_stats_sync_handles_attribute_error_battery_support(monkeypatch):
    def _raise_attribute_error():
        raise AttributeError("battery attribute missing")

    fake_psutil = SimpleNamespace(
        cpu_percent=lambda interval=None: 9.0,
        virtual_memory=lambda: SimpleNamespace(percent=28.0),
        sensors_battery=_raise_attribute_error,
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    stats = system_metrics_module._collect_system_stats_sync()

    assert stats["cpu_percent"] == 9.0
    assert stats["memory_percent"] == 28.0
    assert stats["battery_percent"] is None
    assert stats["battery_charging"] is None


@pytest.mark.asyncio
async def test_collect_system_stats_async_returns_executor_result(monkeypatch):
    expected = {
        "cpu_percent": 11.0,
        "memory_percent": 22.0,
        "battery_percent": None,
        "battery_charging": None,
    }
    monkeypatch.setattr(system_metrics_module, "_collect_system_stats_sync", lambda: expected)

    assert await system_metrics_module.collect_system_stats() == expected


@pytest.mark.asyncio
async def test_collect_system_stats_async_uses_sync_collector_in_executor(monkeypatch):
    expected = {
        "cpu_percent": 13.0,
        "memory_percent": 21.0,
        "battery_percent": None,
        "battery_charging": None,
    }
    seen = {}

    def _sync_collector():
        return expected

    class _FakeLoop:
        async def run_in_executor(self, executor, fn):
            seen["executor"] = executor
            seen["fn"] = fn
            return fn()

    monkeypatch.setattr(system_metrics_module, "_collect_system_stats_sync", _sync_collector)
    monkeypatch.setattr(system_metrics_module.asyncio, "get_event_loop", lambda: _FakeLoop())

    result = await system_metrics_module.collect_system_stats()

    assert result == expected
    assert seen["executor"] is None
    assert seen["fn"] is _sync_collector


@pytest.mark.asyncio
async def test_watermark_load_returns_defaults_when_file_missing(tmp_path: Path):
    store = WatermarkStateStore(tmp_path / "watermark.json")

    assert await store.load() == {
        "last_semanticized_id": None,
        "pending_message_count": 0,
        "last_updated": None,
    }


@pytest.mark.asyncio
async def test_watermark_load_adds_missing_default_keys(tmp_path: Path):
    state_path = tmp_path / "watermark.json"
    state_path.write_text(
        json.dumps({"pending_message_count": 3}),
        encoding="utf-8",
    )
    store = WatermarkStateStore(state_path)

    state = await store.load()

    assert state == {
        "last_semanticized_id": None,
        "pending_message_count": 3,
        "last_updated": None,
    }


@pytest.mark.asyncio
async def test_watermark_load_returns_defaults_on_invalid_json(tmp_path: Path):
    state_path = tmp_path / "watermark.json"
    state_path.write_text("{invalid-json", encoding="utf-8")
    store = WatermarkStateStore(state_path)

    assert await store.load() == {
        "last_semanticized_id": None,
        "pending_message_count": 0,
        "last_updated": None,
    }


@pytest.mark.asyncio
async def test_watermark_save_update_persist_expected_fields(tmp_path: Path):
    state_path = tmp_path / "watermark.json"
    store = WatermarkStateStore(state_path)

    await store.update(last_semanticized_id="mem-1", pending_message_count=4)
    updated_state = json.loads(state_path.read_text(encoding="utf-8"))

    assert updated_state["last_semanticized_id"] == "mem-1"
    assert updated_state["pending_message_count"] == 4
    assert isinstance(updated_state["last_updated"], str)
    datetime.fromisoformat(updated_state["last_updated"])


@pytest.mark.asyncio
async def test_watermark_get_delegates_to_load(tmp_path: Path):
    state_path = tmp_path / "watermark.json"
    store = WatermarkStateStore(state_path)

    await store.update(last_semanticized_id="mem-2", pending_message_count=1)

    assert await store.get() == await store.load()
