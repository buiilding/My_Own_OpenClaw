"""
Enhanced Event Bus for the Desktop Assistant.

Provides a robust event bus with priority support, filtering, error handling,
and middleware capabilities for decoupling components.
"""
import asyncio
import logging
import time
from typing import Callable, Dict, List, Optional, Type, Union, Awaitable

from .events import Event

logger = logging.getLogger(__name__)

EventHandler = Union[Callable[[Event], None], Callable[[Event], Awaitable[None]]]


class EventHandlerWrapper:
    """Wrapper for event handlers with metadata."""
    
    def __init__(
        self,
        handler: EventHandler,
        priority: int = 100,
        filter_func: Optional[Callable[[Event], bool]] = None
    ):
        self.handler = handler
        self.priority = priority  # Lower = higher priority
        self.filter_func = filter_func
    
    async def call(self, event: Event) -> None:
        """Call the handler if it passes the filter."""
        if self.filter_func and not self.filter_func(event):
            return
        
        if asyncio.iscoroutinefunction(self.handler):
            await self.handler(event)
        else:
            self.handler(event)


class EventBus:
    """
    Enhanced event bus for decoupling components.
    
    Features:
    - Priority-based handler execution
    - Event filtering
    - Error handling and recovery
    - Middleware support
    - Both sync and async handlers
    """
    
    def __init__(self, enable_error_recovery: bool = True):
        """
        Initialize the event bus.
        
        Args:
            enable_error_recovery: If True, continue processing other handlers
                                  even if one fails
        """
        self._subscribers: Dict[Type[Event], List[EventHandlerWrapper]] = {}
        self._middleware: List[Callable[[Event], Awaitable[None]]] = []
        self.enable_error_recovery = enable_error_recovery
        self._event_stats: Dict[str, int] = {}
    
    def subscribe(
        self,
        event_type: Type[Event],
        handler: EventHandler,
        priority: int = 100,
        filter_func: Optional[Callable[[Event], bool]] = None
    ) -> None:
        """
        Subscribe a handler to an event type.
        
        Args:
            event_type: The type of event to subscribe to
            handler: Handler function (sync or async)
            priority: Execution priority (lower = higher priority, default: 100)
            filter_func: Optional function to filter events before calling handler
        """
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        
        wrapper = EventHandlerWrapper(handler, priority, filter_func)
        self._subscribers[event_type].append(wrapper)
        
        # Sort by priority (lower = higher priority)
        self._subscribers[event_type].sort(key=lambda w: w.priority)
        
        logger.debug(
            f"Subscribed {handler} to {event_type.__name__} "
            f"(priority: {priority})"
        )
    
    def unsubscribe(self, event_type: Type[Event], handler: EventHandler) -> bool:
        """
        Unsubscribe a handler from an event type.
        
        Args:
            event_type: The event type
            handler: The handler to remove
            
        Returns:
            True if handler was found and removed, False otherwise
        """
        if event_type not in self._subscribers:
            return False
        
        original_count = len(self._subscribers[event_type])
        self._subscribers[event_type] = [
            w for w in self._subscribers[event_type] if w.handler != handler
        ]
        
        removed = len(self._subscribers[event_type]) < original_count
        if removed:
            logger.debug(f"Unsubscribed {handler} from {event_type.__name__}")
        
        return removed
    
    def add_middleware(self, middleware: Callable[[Event], Awaitable[None]]) -> None:
        """
        Add middleware that runs before all handlers.
        
        Args:
            middleware: Async function that receives the event
        """
        self._middleware.append(middleware)
        logger.debug(f"Added middleware: {middleware}")
    
    async def publish(self, event: Event) -> None:
        """
        Publish an event to all subscribers.
        
        Args:
            event: The event to publish
        """
        # Set timestamp if not set
        if not event.timestamp:
            event.timestamp = time.time()
        
        event_type = type(event)
        event_name = event_type.__name__
        
        # Update statistics
        self._event_stats[event_name] = self._event_stats.get(event_name, 0) + 1
        
        # Run middleware
        for middleware in self._middleware:
            try:
                await middleware(event)
            except Exception as e:
                logger.error(f"Error in middleware for {event_name}: {e}", exc_info=True)
                if not self.enable_error_recovery:
                    raise
        
        # Get handlers for this event type
        handlers = self._subscribers.get(event_type, [])
        
        if not handlers:
            logger.debug(f"No handlers for {event_name}")
            return
        
        logger.debug(f"Publishing {event_name} to {len(handlers)} handlers")
        
        # Execute handlers in priority order
        for wrapper in handlers:
            try:
                await wrapper.call(event)
            except Exception as e:
                logger.error(
                    f"Error in event handler {wrapper.handler} for {event_name}: {e}",
                    exc_info=True
                )
                if not self.enable_error_recovery:
                    raise
    
    def get_stats(self) -> Dict[str, int]:
        """Get event publishing statistics."""
        return self._event_stats.copy()
    
    def clear_stats(self) -> None:
        """Clear event statistics."""
        self._event_stats.clear()
    
    def get_subscriber_count(self, event_type: Type[Event]) -> int:
        """Get the number of subscribers for an event type."""
        return len(self._subscribers.get(event_type, []))


# Global singleton instance
message_bus = EventBus()
