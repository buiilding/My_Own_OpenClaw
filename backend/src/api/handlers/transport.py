"""
Transport Abstraction for Query Handler.

Provides a thin abstraction for sending messages, primarily for testability.
"""
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class TransportSender(ABC):
    """
    Transport abstraction for sending messages.
    
    NOTE: This is a testing seam, not a promise of transport-agnostic architecture.
    We currently have exactly one transport (WebSocket) and WebSocket semantics
    (ordering, connection lifecycle) still leak throughout the system.
    
    Treat this as:
    - A seam for testing (mock sender)
    - A future escape hatch
    
    Not as: "We're transport-agnostic now" - we're not, yet.
    """
    
    @abstractmethod
    async def send(self, message: Dict[str, Any]) -> None:
        """
        Send a message via the transport.
        
        Args:
            message: Message dictionary to send
        """
        pass


class WebSocketTransportSender(TransportSender):
    """WebSocket transport implementation."""
    
    def __init__(self, websocket: WebSocket):
        """
        Initialize WebSocket transport sender.
        
        Args:
            websocket: WebSocket connection
        """
        self.websocket = websocket
    
    async def send(self, message: Dict[str, Any]) -> None:
        """
        Send a message via WebSocket.
        
        Handles connection errors gracefully - if connection is closed, logs and raises
        to allow caller to handle appropriately.
        
        Args:
            message: Message dictionary to send
            
        Raises:
            WebSocketDisconnect: If connection is closed
            RuntimeError: If connection error occurs
            ConnectionError: If connection error occurs
        """
        try:
            await self.websocket.send_json(message)
        except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
            logger.debug(f"Failed to send message via transport to closed connection: {e}")
            raise
