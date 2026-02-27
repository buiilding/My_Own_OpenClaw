from __future__ import annotations

import pytest

from backend.src.api.transport.sender import WebSocketTransportSender


class DummyWebSocket:
    def __init__(self):
        self.calls = []

    async def send_json(self, data, mode="text"):
        self.calls.append((data, mode))


class FailingWebSocket:
    async def send_json(self, data, mode="text"):
        raise RuntimeError(f"send failed: {data.get('type')}")


@pytest.mark.asyncio
async def test_websocket_transport_sender_forwards_message_with_default_mode():
    websocket = DummyWebSocket()
    sender = WebSocketTransportSender(websocket)

    payload = {"type": "event", "payload": {"ok": True}}
    await sender.send(payload)

    assert websocket.calls == [(payload, "text")]


@pytest.mark.asyncio
async def test_websocket_transport_sender_propagates_send_errors():
    sender = WebSocketTransportSender(FailingWebSocket())

    with pytest.raises(RuntimeError, match="send failed: event"):
        await sender.send({"type": "event", "payload": {"ok": False}})


@pytest.mark.asyncio
async def test_websocket_transport_sender_copies_payload_before_forwarding():
    websocket = DummyWebSocket()
    sender = WebSocketTransportSender(websocket)
    payload = {"type": "event", "payload": {"status": "pending"}}

    await sender.send(payload)
    payload["payload"]["status"] = "mutated"

    assert websocket.calls[0][0]["payload"]["status"] == "pending"
