"""Shared system metrics collector used by core state and tool endpoints."""

from __future__ import annotations

import asyncio
from typing import Any


def _collect_system_stats_sync() -> dict[str, Any]:
    import psutil

    cpu_percent = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    try:
        battery = psutil.sensors_battery()
        battery_percent = battery.percent if battery else None
        battery_charging = battery.power_plugged if battery else None
    except (AttributeError, NotImplementedError):
        # Battery telemetry is unavailable on some platforms/hosts.
        battery_percent = None
        battery_charging = None

    return {
        "cpu_percent": cpu_percent,
        "memory_percent": mem.percent,
        "battery_percent": battery_percent,
        "battery_charging": battery_charging,
    }


async def collect_system_stats() -> dict[str, Any]:
    """Collect CPU/memory/battery metrics in a thread to avoid blocking the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _collect_system_stats_sync)
