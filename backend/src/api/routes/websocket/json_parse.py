"""
Shared JSON parse policy for WebSocket route modules.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Callable

DEFAULT_JSON_PARSE_OFFLOAD_BYTES = 64 * 1024


async def parse_json_payload(
    data: str,
    *,
    offload_threshold_bytes: int = DEFAULT_JSON_PARSE_OFFLOAD_BYTES,
    loop_getter: Callable[[], asyncio.AbstractEventLoop] = asyncio.get_running_loop,
) -> Any:
    """
    Parse JSON payload data.

    Small payloads are parsed inline to avoid thread-pool scheduling overhead.
    Large payloads are offloaded to avoid blocking the event loop.
    """
    if len(data) >= offload_threshold_bytes:
        loop = loop_getter()
        return await loop.run_in_executor(None, json.loads, data)
    return json.loads(data)
