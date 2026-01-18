"""
Base Handler Classes for WebSocket Messages.

This module defines the base handler interface and registry pattern
for WebSocket message handling.
"""
import logging
from abc import ABC, abstractmethod
from collections.abc import Awaitable
from typing import Any, Callable, Dict, Optional, Union

from backend.src.api.handlers.transport import WebSocketSender
from backend.src.api.schema import BaseMessage, IncomingMessage

logger = logging.getLogger(__name__)


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


class MessageHandlerRegistry:
    """
    Registry for WebSocket message handlers.
    
    Provides a centralized way to register and route messages
    to appropriate handlers, making it easy to add new message types.
    """
    
    def __init__(self):
        """Initialize the handler registry."""
        self._handlers: Dict[str, MessageHandler] = {}
        # Middleware still uses dict for backward compatibility if needed
        self._middleware: list[Callable[[Dict[str, Any], WebSocketSender], Union[None, Awaitable[None]]]] = []
    
    def register(
        self, 
        message_type: str, 
        handler: MessageHandler
    ) -> None:
        """
        Register a message handler.
        
        Args:
            message_type: Message type string (e.g., "query", "ping")
            handler: Handler instance
            
        Raises:
            ValueError: If message_type is already registered
        """
        if message_type in self._handlers:
            logger.warning(
                f"Handler for message type '{message_type}' already registered. "
                f"Overwriting with {type(handler).__name__}"
            )
        
        self._handlers[message_type] = handler
        logger.debug(f"Registered handler for message type: {message_type}")
    
    def unregister(self, message_type: str) -> bool:
        """
        Unregister a message handler.
        
        Args:
            message_type: Message type to unregister
            
        Returns:
            True if handler was found and removed, False otherwise
        """
        if message_type in self._handlers:
            del self._handlers[message_type]
            logger.debug(f"Unregistered handler for message type: {message_type}")
            return True
        return False
    
    def add_middleware(
        self, 
        middleware: Callable[[Dict[str, Any], WebSocketSender], Union[None, Awaitable[None]]]
    ) -> None:
        """
        Add middleware that runs before all handlers.
        
        Args:
            middleware: Middleware function that receives (data, websocket).
                Can be either sync (returns None) or async (returns Awaitable[None]).
        """
        self._middleware.append(middleware)
        logger.debug(f"Added middleware: {middleware}")
    
    async def handle(
        self, 
        message_type: str,
        message: IncomingMessage,
        websocket: WebSocketSender,
        user_id: str
    ) -> None:
        """
        Route message to appropriate handler.
        
        Args:
            message_type: Type of message (must match message.type)
            message: Validated Pydantic message model (IncomingMessage)
            websocket: WebSocketSender (thread-safe protocol implementation)
            user_id: User ID from connection context
            
        Raises:
            ValueError: If no handler is registered for the message type
            Exception: If handler execution fails
        """
        # Run middleware (convert to dict for middleware backward compatibility)
        # CRITICAL: Middleware exceptions MUST propagate to caller to prevent fail-open security vulnerabilities.
        # If authentication or rate limiting middleware fails, the handler must NOT execute.
        # Non-critical middleware (e.g., logging, metrics) should catch and handle their own
        # exceptions internally if they don't want to block processing.
        # Critical middleware (e.g., auth) should raise exceptions that will stop message processing.
        message_dict = message.model_dump()  # Convert for middleware only
        for middleware in self._middleware:
            try:
                result = middleware(message_dict, websocket)
                # Check if result is awaitable (coroutine)
                if hasattr(result, '__await__'):
                    await result
            except Exception as e:
                # Log middleware failure but propagate exception to prevent handler execution
                # This ensures fail-closed behavior for security-critical middleware
                logger.error(
                    f"Middleware failed for message type '{message_type}': {e}",
                    exc_info=True
                )
                raise
        
        # Get handler
        handler = self._handlers.get(message_type)
        if not handler:
            # Don't leak internal handler list in error message (security)
            raise ValueError(
                f"No handler registered for message type: {message_type}"
            )
        
        # Validate message
        if not handler.validate_message(message):
            raise ValueError(f"Invalid message data for type: {message_type}")
        
        # Execute handler with typed message
        try:
            await handler.handle(message, websocket, user_id)
        except Exception as e:
            logger.error(
                f"Error in handler for message type '{message_type}': {e}",
                exc_info=True
            )
            raise
    
    def get_handler(self, message_type: str) -> Optional[MessageHandler]:
        """
        Get handler for a message type.
        
        Args:
            message_type: Message type string
            
        Returns:
            Handler instance or None if not found
        """
        return self._handlers.get(message_type)
    
    def list_handlers(self) -> list[str]:
        """
        List all registered message types.
        
        Returns:
            List of registered message type strings
        """
        return list(self._handlers.keys())



