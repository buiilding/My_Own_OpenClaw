import asyncio
import logging
import time
from typing import Callable, Dict, List, Type, Union, Awaitable

from .events import Event

logger = logging.getLogger(__name__)

EventHandler = Union[Callable[[Event], None], Callable[[Event], Awaitable[None]]]

class EventBus:
    """
    Simple in-memory event bus for decoupling components.
    Supports both sync and async handlers.
    """

    def __init__(self):
        self._subscribers: Dict[Type[Event], List[EventHandler]] = {}

    def subscribe(self, event_type: Type[Event], handler: EventHandler) -> None:
        """Subscribe a handler to an event type."""
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)
        logger.debug(f"Subscribed {handler} to {event_type.__name__}")

    async def publish(self, event: Event) -> None:
        """Publish an event to all subscribers."""
        if not event.timestamp:
            event.timestamp = time.time()
            
        event_type = type(event)
        handlers = self._subscribers.get(event_type, [])
        
        if not handlers:
            return

        logger.debug(f"Publishing {event_type.__name__} to {len(handlers)} handlers")
        
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    # Run sync handlers directly
                    handler(event)
            except Exception as e:
                logger.error(
                    f"Error in event handler {handler} for {event_type.__name__}: {e}", 
                    exc_info=True
                )

# Global singleton instance
message_bus = EventBus()

