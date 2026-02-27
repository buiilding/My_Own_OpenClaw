from __future__ import annotations

from typing import Any, Optional

from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.transport.websocket import SafeWebSocket


class ProtocolCompliantSender:
    async def send_json(self, data: Any, mode: str = "text") -> None:  # noqa: ARG002
        return None

    async def send_text(self, data: str) -> None:  # noqa: ARG002
        return None

    async def close(self, code: int = 1000, reason: Optional[str] = None) -> None:  # noqa: ARG002
        return None


class MissingCloseSender:
    async def send_json(self, data: Any, mode: str = "text") -> None:  # noqa: ARG002
        return None

    async def send_text(self, data: str) -> None:  # noqa: ARG002
        return None


class DummyRawWebSocket:
    async def send_json(self, data: Any, mode: str = "text") -> None:  # noqa: ARG002
        return None

    async def send_text(self, data: str) -> None:  # noqa: ARG002
        return None

    async def close(self, code: int = 1000, reason: Optional[str] = None) -> None:  # noqa: ARG002
        return None


def test_websocket_sender_protocol_accepts_compliant_sender() -> None:
    assert isinstance(ProtocolCompliantSender(), WebSocketSender)


def test_websocket_sender_protocol_rejects_missing_close_method() -> None:
    assert not isinstance(MissingCloseSender(), WebSocketSender)


def test_safe_websocket_runtime_matches_websocket_sender_protocol() -> None:
    safe = SafeWebSocket(DummyRawWebSocket())

    assert isinstance(safe, WebSocketSender)
