import asyncio
from typing import Any, Optional

import pytest

from backend.src.api.transport.websocket import SafeWebSocket


class FakeRawWebSocket:
    def __init__(
        self, *, send_delay: float = 0.0, fail_on_send_call: Optional[int] = None
    ):
        self.send_delay = send_delay
        self.fail_on_send_call = fail_on_send_call
        self.send_count = 0
        self.sent_json: list[tuple[Any, str]] = []
        self.sent_text: list[str] = []
        self.closed: list[tuple[int, Optional[str]]] = []
        self.accepted = False

    async def send_json(self, data: Any, mode: str = "text") -> None:
        self.send_count += 1
        if self.send_delay:
            await asyncio.sleep(self.send_delay)
        if self.fail_on_send_call and self.send_count >= self.fail_on_send_call:
            raise ConnectionError("connection closed")
        self.sent_json.append((data, mode))

    async def send_text(self, data: str) -> None:
        if self.send_delay:
            await asyncio.sleep(self.send_delay)
        self.sent_text.append(data)

    async def close(self, code: int = 1000, reason: Optional[str] = None) -> None:
        self.closed.append((code, reason))

    async def accept(self) -> None:
        self.accepted = True


@pytest.mark.asyncio
async def test_safe_websocket_applies_backpressure_with_bounded_queue() -> None:
    raw = FakeRawWebSocket(send_delay=0.25)
    safe = SafeWebSocket(raw, max_queue_size=1)

    task1 = asyncio.create_task(safe.send_json({"index": 1}))
    await asyncio.sleep(0.01)
    task2 = asyncio.create_task(safe.send_json({"index": 2}))
    await asyncio.sleep(0.01)
    task3 = asyncio.create_task(safe.send_json({"index": 3}))

    await asyncio.sleep(0.05)
    assert not task3.done()

    await asyncio.gather(task1, task2, task3)
    assert [data["index"] for data, _ in raw.sent_json] == [1, 2, 3]
    await safe.close(code=1000, reason="done")


@pytest.mark.asyncio
async def test_safe_websocket_drains_pending_futures_on_sender_failure() -> None:
    raw = FakeRawWebSocket(fail_on_send_call=1)
    safe = SafeWebSocket(raw, max_queue_size=4)

    task1 = asyncio.create_task(safe.send_json({"index": 1}))
    task2 = asyncio.create_task(safe.send_json({"index": 2}))

    with pytest.raises(Exception):
        await task1
    with pytest.raises(Exception):
        await asyncio.wait_for(task2, timeout=1.0)

    with pytest.raises(Exception):
        await safe.send_json({"index": 3})
    await safe.close(code=1000, reason="done")


@pytest.mark.asyncio
async def test_safe_websocket_close_flushes_queued_messages_before_close() -> None:
    raw = FakeRawWebSocket(send_delay=0.05)
    safe = SafeWebSocket(raw, max_queue_size=8)

    send_first = asyncio.create_task(safe.send_json({"index": 1}))
    send_second = asyncio.create_task(safe.send_json({"index": 2}))
    await asyncio.sleep(0.01)

    await safe.close(code=1000, reason="done")
    await asyncio.gather(send_first, send_second)

    assert [data["index"] for data, _ in raw.sent_json] == [1, 2]
    assert raw.closed == [(1000, "done")]
