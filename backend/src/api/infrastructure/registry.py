"""
Message Handler Registry.

Provides centralized registration and routing of WebSocket message handlers.
"""
from dataclasses import dataclass
import inspect
import logging
from collections.abc import Awaitable
from typing import Callable, Optional, Union

from backend.src.api.infrastructure.handler import MessageHandler
from backend.src.api.schema import BaseMessage, IncomingMessage
from backend.src.api.transport.protocol import WebSocketSender

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RegisteredMiddleware:
    """Registration-time middleware dispatch metadata."""

    middleware: Callable[[IncomingMessage, WebSocketSender], Union[None, Awaitable[None]]]
    is_async_callable: bool


class MessageHandlerRegistry:
    """
    Registry for WebSocket message handlers.
    
    Provides a centralized way to register and route messages
    to appropriate handlers, making it easy to add new message types.
    """
    
    def __init__(self):
        """Initialize the handler registry."""
        self._handlers: dict[str, MessageHandler] = {}
        # Middleware receives typed Pydantic models for type safety
        self._middleware: list[RegisteredMiddleware] = []
    
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
        middleware: Callable[[IncomingMessage, WebSocketSender], Union[None, Awaitable[None]]]
    ) -> None:
        """
        Add middleware that runs before all handlers.
        
        Args:
            middleware: Middleware function that receives (message, websocket).
                Can be either sync (returns None) or async (returns Awaitable[None]).
                Receives typed IncomingMessage for type safety.
        """
        self._middleware.append(
            RegisteredMiddleware(
                middleware=middleware,
                is_async_callable=self._is_async_middleware(middleware),
            )
        )
        logger.debug(f"Added middleware: {middleware}")

    @staticmethod
    def _is_async_middleware(
        middleware: Callable[[IncomingMessage, WebSocketSender], Union[None, Awaitable[None]]]
    ) -> bool:
        """Determine async middleware shape once at registration time."""
        if inspect.iscoroutinefunction(middleware):
            return True
        call = getattr(middleware, "__call__", None)
        return bool(call and inspect.iscoroutinefunction(call))
    
    async def handle(
        self, 
        message_type: str,
        message: IncomingMessage,
        websocket: WebSocketSender,
        user_id: str
    ) -> None:
        """
        Route message to appropriate handler.
        
        RELIABILITY: Handlers that spawn background sub-tasks (e.g., via asyncio.create_task())
        MUST track those tasks for cleanup. Options:
        1. Attach tasks to AgentSession (accessible via session_manager.get_session(user_id))
        2. Use a session-scoped task registry
        3. Pass a cancellation token that can be triggered on WebSocket disconnect
        
        Untracked sub-tasks will continue running after disconnect, causing resource leaks
        and potential security issues (processing requests for disconnected users).
        
        Args:
            message_type: Type of message (must match message.type)
            message: Validated Pydantic message model (IncomingMessage)
            websocket: WebSocketSender (thread-safe protocol implementation)
            user_id: User ID from connection context
            
        Raises:
            ValueError: If no handler is registered for the message type
            Exception: If handler execution fails
        """
        # Run middleware with typed Pydantic models for type safety
        # CRITICAL: Middleware exceptions MUST propagate to caller to prevent fail-open security vulnerabilities.
        # If authentication or rate limiting middleware fails, the handler must NOT execute.
        # Non-critical middleware (e.g., logging, metrics) should catch and handle their own
        # exceptions internally if they don't want to block processing.
        # Critical middleware (e.g., auth) should raise exceptions that will stop message processing.
        for registered in self._middleware:
            middleware = registered.middleware
            try:
                result = middleware(message, websocket)
                if registered.is_async_callable or inspect.isawaitable(result):
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
