"""
Base Handler Class for WebSocket Messages.

Defines the base handler interface that all message handlers must implement.
"""
from abc import ABC, abstractmethod

from backend.src.api.schema import BaseMessage
from backend.src.api.transport.protocol import WebSocketSender


class MessageHandler(ABC):
    """
    Base class for WebSocket message handlers.
    
    All message handlers must inherit from this class and implement
    the handle method.
    """
    
    @abstractmethod
    async def handle(
        self, 
        message: BaseMessage, 
        websocket: WebSocketSender,
        user_id: str
    ) -> None:
        """
        Handle a WebSocket message.
        
        Args:
            message: Validated Pydantic message model (BaseMessage or subclass)
            websocket: WebSocketSender (thread-safe protocol implementation)
            user_id: User ID from connection context
            
        Raises:
            Exception: If message handling fails
        """
        pass
    
    def validate_message(self, message: BaseMessage) -> bool:
        """
        Validate message data (optional override).
        
        Args:
            message: Pydantic message model to validate
            
        Returns:
            True if message is valid, False otherwise
        """
        return True
