"""
WebSocket Sender Protocol.

Defines the protocol interface for thread-safe WebSocket operations.
"""
from typing import Any, Optional, Protocol, runtime_checkable


# Fixes Point #6: Strict Protocol instead of Any
@runtime_checkable
class WebSocketSender(Protocol):
    """
    Protocol defining the thread-safe interface for WebSocket operations.
    
    Consumers (like TTSManager) should type-hint against this, not raw WebSocket.
    This ensures all send operations go through thread-safe implementations.
    """
    async def send_json(self, data: Any, mode: str = "text") -> None:
        """Send JSON data safely."""
        ...

    async def send_text(self, data: str) -> None:
        """Send text data safely."""
        ...

    async def close(self, code: int = 1000, reason: Optional[str] = None) -> None:
        """Close connection safely."""
        ...
