"""
Transport Sender Implementation.

Abstract base class and WebSocket implementation for transport senders.
"""
from copy import deepcopy
from abc import ABC, abstractmethod
from typing import Any, Dict

from backend.src.api.transport.protocol import WebSocketSender


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
        # Isolate transport payload from caller-side mutation.
        await self.websocket.send_json(deepcopy(message))
