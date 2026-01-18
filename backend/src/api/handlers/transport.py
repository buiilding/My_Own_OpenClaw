"""
Transport Abstraction for Query Handler.

Provides a thin abstraction for sending messages, primarily for testability.
"""
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Union

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
    """
    WebSocket transport implementation.
    
    CRITICAL: Accepts SafeWebSocket to enforce thread-safe serialization of writes.
    Without SafeWebSocket, concurrent writes from handlers and background tasks
    (e.g., TTS streaming) will corrupt WebSocket protocol frames.
    """
    
    def __init__(self, websocket: Union[WebSocket, Any]):
        """
        Initialize WebSocket transport sender.
        
        Args:
            websocket: SafeWebSocket instance (or WebSocket for backward compatibility).
                      SafeWebSocket provides thread-safe serialization via asyncio.Lock.
                      
        Raises:
            TypeError: If websocket doesn't have send_json method
        """
        # Accept SafeWebSocket or raw WebSocket for backward compatibility
        # SafeWebSocket has send_json method via __getattr__ delegation
        if not hasattr(websocket, 'send_json'):
            raise TypeError(f"websocket must have send_json method, got {type(websocket)}")
        self.websocket = websocket
    
    async def send(self, message: Dict[str, Any]) -> None:
        """
        Send a message via WebSocket.
        
        Uses SafeWebSocket.send_json() which serializes writes via asyncio.Lock,
        preventing concurrent write corruption.
        
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
