"""
EventBus handler storage and resolution helpers.

Extracted from EventBus to keep publish-path logic focused and easier to evolve.
"""

from __future__ import annotations

import inspect
import threading
import weakref
from typing import Awaitable, Callable, Dict, List, Optional, Type, Union

from backend.src.core.events.base import Event

EventHandler = Union[Callable[[Event], None], Callable[[Event], Awaitable[None]]]


class EventHandlerWrapper:
    """
    Wrapper for event handlers with metadata.
    """

    def __init__(
        self,
        handler: EventHandler,
        priority: int = 100,
        filter_func: Optional[Callable[[Event], bool]] = None,
    ):
        if inspect.ismethod(handler):
            self._handler_ref = weakref.WeakMethod(handler)
            self._is_weak = True
        else:
            self._handler = handler
            self._is_weak = False

        self.priority = priority
        self.filter_func = filter_func

    @property
    def handler(self) -> Optional[EventHandler]:
        if self._is_weak:
            return self._handler_ref()
        return self._handler

    def is_alive(self) -> bool:
        if self._is_weak:
            return self._handler_ref() is not None
        return True

    async def call(self, event: Event) -> None:
        if self.filter_func and not self.filter_func(event):
            return

        handler = self.handler
        if handler is None:
            return

        result = handler(event)
        if inspect.isawaitable(result):
            await result


class EventHandlerStore:
    """
    Thread-safe storage, caching, and resolution for EventBus handlers.
    """

    def __init__(self, lock: threading.RLock):
        self._lock = lock
        self._subscribers: Dict[Type[Event], List[EventHandlerWrapper]] = {}
        self._handler_cache: Dict[tuple, List[EventHandlerWrapper]] = {}
        self._event_class_cache: Dict[Type[Event], List[Type[Event]]] = {}

    def subscribe(
        self,
        event_type: Type[Event],
        handler: EventHandler,
        priority: int = 100,
        filter_func: Optional[Callable[[Event], bool]] = None,
    ) -> EventHandlerWrapper:
        with self._lock:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []

            wrapper = EventHandlerWrapper(handler, priority, filter_func)
            self._subscribers[event_type].append(wrapper)
            self._subscribers[event_type].sort(key=lambda w: w.priority)
            self._invalidate_handler_cache()
            return wrapper

    def unsubscribe(self, event_type: Type[Event], handler: EventHandler) -> bool:
        with self._lock:
            if event_type not in self._subscribers:
                return False

            handlers = self._subscribers[event_type]
            for i, wrapper in enumerate(handlers):
                if wrapper.handler == handler:
                    del handlers[i]
                    self._invalidate_handler_cache()
                    return True
            return False

    def get_subscriber_count(self, event_type: Type[Event]) -> int:
        with self._lock:
            return len(self._subscribers.get(event_type, []))

    def resolve_handlers(self, event_type: Type[Event]) -> List[EventHandlerWrapper]:
        cached = self._get_cached_handlers(event_type)
        if cached is not None:
            return cached

        handlers: List[EventHandlerWrapper] = []
        with self._lock:
            for cls in self.iter_event_classes(event_type):
                if cls in self._subscribers:
                    handlers.extend(self._subscribers[cls])

        unique_handlers = self._dedupe_handlers(handlers)
        unique_handlers.sort(key=lambda w: w.priority)

        with self._lock:
            self._cache_handlers(event_type, unique_handlers)

        return unique_handlers

    def filter_active_handlers(
        self,
        handlers: List[EventHandlerWrapper],
        event_type: Type[Event],
    ) -> List[EventHandlerWrapper]:
        active_handlers = [w for w in handlers if w.is_alive()]
        if len(active_handlers) < len(handlers):
            self._cleanup_dead_handlers(event_type)
        return active_handlers

    def iter_event_classes(self, event_type: Type[Event]) -> List[Type[Event]]:
        cached = self._event_class_cache.get(event_type)
        if cached is not None:
            return cached

        classes = [cls for cls in event_type.__mro__ if cls is not object]
        with self._lock:
            existing = self._event_class_cache.get(event_type)
            if existing is None:
                self._event_class_cache[event_type] = classes
                return classes
            return existing

    def _invalidate_handler_cache(self) -> None:
        self._handler_cache.clear()

    def _get_cached_handlers(
        self, event_type: Type[Event]
    ) -> Optional[List[EventHandlerWrapper]]:
        return self._handler_cache.get(self._get_mro_key(event_type))

    def _cache_handlers(
        self, event_type: Type[Event], handlers: List[EventHandlerWrapper]
    ) -> None:
        self._handler_cache[self._get_mro_key(event_type)] = handlers

    def _get_mro_key(self, event_type: Type[Event]) -> tuple:
        return tuple(cls for cls in event_type.__mro__ if cls is not object)

    def _dedupe_handlers(
        self, handlers: List[EventHandlerWrapper]
    ) -> List[EventHandlerWrapper]:
        seen = set()
        unique_handlers = []
        for wrapper in handlers:
            handler = wrapper.handler
            if handler is None:
                continue
            handler_id = id(handler)
            if handler_id not in seen:
                seen.add(handler_id)
                unique_handlers.append(wrapper)
        return unique_handlers

    def _cleanup_dead_handlers(self, event_type: Type[Event]) -> None:
        with self._lock:
            self._invalidate_handler_cache()
            for cls in self.iter_event_classes(event_type):
                if cls in self._subscribers:
                    self._subscribers[cls] = [
                        w for w in self._subscribers[cls] if w.is_alive()
                    ]
