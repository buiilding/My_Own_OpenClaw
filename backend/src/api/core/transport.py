"""
Transport Abstractions.

Defines the protocol for sending messages to clients, decoupling logic
from specific WebSocket implementations and ensuring type safety.
"""
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Protocol, runtime_checkable

logger = logging.getLogger(__name__)

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


class TransportSender(ABC):
    """
    Abstract base class for transport senders.
    
    Used for testing seams and future transport flexibility.
    NOTE: This is a testing seam, not a promise of transport-agnostic architecture.
    We currently have exactly one transport (WebSocket) and WebSocket semantics
    (ordering, connection lifecycle) still leak throughout the system.
    """
    
    @abstractmethod
    async def send(self, message: Dict[str, Any]) -> None:
        """
        Send a message dictionary.
        
        Args:
            message: Message dictionary to send
        """
        pass


class WebSocketTransportSender(TransportSender):
    """
    WebSocket transport implementation.
    
    Wraps a WebSocketSender (Protocol) to send messages.
    Relies on the Protocol's send_json, which must be thread-safe.
    """
    
    def __init__(self, websocket: WebSocketSender):
        """
        Initialize with a safe sender.
        
        Args:
            websocket: A compliant WebSocketSender (e.g., SafeWebSocket)
        """
        self.websocket = websocket

    async def send(self, message: Dict[str, Any]) -> None:
        """
        Send a message via WebSocket.
        
        Relies on the Protocol's send_json, which must be thread-safe.
        
        Args:
            message: Message dictionary to send
            
        Raises:
            RuntimeError: If connection error occurs
            ConnectionError: If connection error occurs
        """
        # Protocol implementations raise these on disconnection
        await self.websocket.send_json(message)
