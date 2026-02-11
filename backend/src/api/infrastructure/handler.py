"""
Base Handler Class for WebSocket Messages.

Defines the base handler interface that all message handlers must implement.
"""

from abc import ABC, abstractmethod
from typing import Generic, TypeVar

from backend.src.api.schema import BaseMessage
from backend.src.api.transport.protocol import WebSocketSender

MessageT = TypeVar("MessageT", bound=BaseMessage)


class MessageHandler(ABC):
    """
    Base class for WebSocket message handlers.

    All message handlers must inherit from this class and implement
    the handle method.
    """

    @abstractmethod
    async def handle(
        self, message: BaseMessage, websocket: WebSocketSender, user_id: str
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


class TypedMessageHandler(MessageHandler, Generic[MessageT], ABC):
    """
    Typed handler base to remove repeated casts in concrete handlers.

    Subclasses declare ``message_model`` and implement ``handle_typed``.
    """

    message_model: type[MessageT]

    def validate_message(self, message: BaseMessage) -> bool:
        """Validate message type against declared model."""
        return isinstance(message, self.message_model)

    async def handle(
        self, message: BaseMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """Dispatch validated message to typed implementation."""
        if not isinstance(message, self.message_model):
            raise TypeError(
                f"Expected {self.message_model.__name__}, got {type(message).__name__}"
            )
        await self.handle_typed(message, websocket, user_id)

    @abstractmethod
    async def handle_typed(
        self, message: MessageT, websocket: WebSocketSender, user_id: str
    ) -> None:
        """Handle a strongly typed message."""
        raise NotImplementedError
