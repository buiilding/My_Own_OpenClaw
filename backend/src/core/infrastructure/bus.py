"""
Enhanced Event Bus for the Desktop Assistant.

Provides a robust event bus with priority support, filtering, error handling,
and middleware capabilities for decoupling components.
"""

from __future__ import annotations

import logging
import threading
from typing import Awaitable, Callable, Dict, List, Optional, Type

from backend.src.core.events.base import Event
from backend.src.core.infrastructure.event_bus_registry import (
    EventHandler,
    EventHandlerWrapper,
    EventHandlerStore,
)

logger = logging.getLogger(__name__)


class EventBus:
    """
    Enhanced event bus for decoupling components.

    Features:
    - Priority-based handler execution
    - Event filtering
    - Error handling and recovery
    - Global listeners (run before all handlers)
    - Both sync and async handlers
    """

    def __init__(self, enable_error_recovery: bool = True):
        self.enable_error_recovery = enable_error_recovery
        self._event_stats: Dict[str, int] = {}
        self._lock = threading.RLock()
        self._global_listeners: List[Callable[[Event], Awaitable[Optional[bool]]]] = []
        self._store = EventHandlerStore(self._lock)

    def subscribe(
        self,
        event_type: Type[Event],
        handler: EventHandler,
        priority: int = 100,
        filter_func: Optional[Callable[[Event], bool]] = None,
    ) -> None:
        self._store.subscribe(event_type, handler, priority, filter_func)
        logger.debug(
            "Subscribed %s to %s (priority: %s)",
            handler,
            event_type.__name__,
            priority,
        )

    def unsubscribe(self, event_type: Type[Event], handler: EventHandler) -> bool:
        removed = self._store.unsubscribe(event_type, handler)
        if removed:
            logger.debug("Unsubscribed %s from %s", handler, event_type.__name__)
        return removed

    def add_global_listener(
        self, listener: Callable[[Event], Awaitable[Optional[bool]]]
    ) -> None:
        with self._lock:
            self._global_listeners.append(listener)
        logger.debug("Added global listener: %s", listener)

    def add_middleware(
        self, middleware: Callable[[Event], Awaitable[Optional[bool]]]
    ) -> None:
        import warnings

        warnings.warn(
            "add_middleware is deprecated. Use add_global_listener instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        self.add_global_listener(middleware)

    async def publish(self, event: Event) -> None:
        event_type = type(event)
        event_name = event_type.__name__

        with self._lock:
            self._event_stats[event_name] = self._event_stats.get(event_name, 0) + 1
            listeners_copy = list(self._global_listeners)

        for listener in listeners_copy:
            try:
                result = await listener(event)
                if result is False:
                    logger.debug(
                        "Event %s blocked by global listener %s",
                        event_name,
                        listener,
                    )
                    return
            except Exception as e:
                logger.error(
                    "Error in global listener for %s: %s",
                    event_name,
                    e,
                    exc_info=True,
                )
                if not self.enable_error_recovery:
                    return

        handlers = self._store.resolve_handlers(event_type)
        if not handlers:
            logger.debug(
                "No handlers for %s (checked MRO: %s)",
                event_name,
                [cls.__name__ for cls in self._store.iter_event_classes(event_type)],
            )
            return

        logger.debug("Publishing %s to %s handlers", event_name, len(handlers))
        active_handlers = self._store.filter_active_handlers(handlers, event_type)
        for wrapper in active_handlers:
            try:
                await wrapper.call(event)
            except Exception as e:
                logger.error(
                    "Error in event handler %s for %s: %s",
                    wrapper.handler,
                    event_name,
                    e,
                    exc_info=True,
                )
                if not self.enable_error_recovery:
                    return

    def get_stats(self) -> Dict[str, int]:
        with self._lock:
            return self._event_stats.copy()

    def clear_stats(self) -> None:
        with self._lock:
            self._event_stats.clear()

    def get_subscriber_count(self, event_type: Type[Event]) -> int:
        return self._store.get_subscriber_count(event_type)
