"""
Shared JSON parse policy for WebSocket route modules.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Dict

DEFAULT_JSON_PARSE_OFFLOAD_BYTES = 64 * 1024


class JsonRootTypeError(TypeError):
    """Raised when parsed JSON payload is not an object root."""

    def __init__(self, payload_type: str) -> None:
        self.payload_type = payload_type
        super().__init__(f"root must be an object, got {payload_type}")


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


async def parse_json_object_payload(
    data: str,
    *,
    offload_threshold_bytes: int = DEFAULT_JSON_PARSE_OFFLOAD_BYTES,
    loop_getter: Callable[[], asyncio.AbstractEventLoop] = asyncio.get_running_loop,
) -> Dict[str, Any]:
    """
    Parse JSON payload and require an object root.

    Raises:
        JsonRootTypeError: Parsed JSON is not an object root.
        json.JSONDecodeError: JSON is malformed.
    """
    parsed = await parse_json_payload(
        data,
        offload_threshold_bytes=offload_threshold_bytes,
        loop_getter=loop_getter,
    )
    if not isinstance(parsed, dict):
        raise JsonRootTypeError(type(parsed).__name__)
    return parsed
