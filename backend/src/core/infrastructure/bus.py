"""
Enhanced Event Bus for the Desktop Assistant.

Provides a robust event bus with priority support, filtering, error handling,
and middleware capabilities for decoupling components.
"""
import inspect
import logging
import threading
import weakref
from typing import Callable, Dict, List, Optional, Type, Union, Awaitable

from backend.src.core.events.base import Event

logger = logging.getLogger(__name__)

EventHandler = Union[Callable[[Event], None], Callable[[Event], Awaitable[None]]]


class EventHandlerWrapper:
    """
    Wrapper for event handlers with metadata.
    
    MEMORY MANAGEMENT: Uses weak references for bound methods to prevent memory leaks.
    If a handler object is garbage collected, the wrapper becomes inactive.
    """
    
    def __init__(
        self,
        handler: EventHandler,
        priority: int = 100,
        filter_func: Optional[Callable[[Event], bool]] = None
    ):
        # MEMORY MANAGEMENT: Use weak reference for bound methods to prevent leaks
        # For unbound functions, store directly (they don't hold object references)
        if inspect.ismethod(handler):
            # Bound method - use WeakMethod to allow GC of the object
            self._handler_ref = weakref.WeakMethod(handler)
            self._is_weak = True
        else:
            # Unbound function or callable - store directly
            self._handler = handler
            self._is_weak = False
        
        self.priority = priority  # Lower = higher priority
        self.filter_func = filter_func
    
    @property
    def handler(self) -> Optional[EventHandler]:
        """
        Get the handler, resolving weak reference if needed.
        
        Returns:
            Handler if still alive, None if object was garbage collected
        """
        if self._is_weak:
            return self._handler_ref()
        return self._handler
    
    def is_alive(self) -> bool:
        """Check if the handler is still alive (for weak references)."""
        if self._is_weak:
            return self._handler_ref() is not None
        return True
    
    async def call(self, event: Event) -> None:
        """
        Call the handler if it passes the filter.
        
        CORRECTNESS: Uses inspect.isawaitable on the result to properly handle
        async functions wrapped in functools.partial or async callable objects.
        This prevents silent failures where async handlers return coroutines
        that are never awaited.
        
        MEMORY MANAGEMENT: Checks if handler is still alive (for weak references)
        before calling to handle cases where the object was garbage collected.
        """
        if self.filter_func and not self.filter_func(event):
            return
        
        # MEMORY MANAGEMENT: Check if handler is still alive (weak reference may be dead)
        handler = self.handler
        if handler is None:
            # Handler object was garbage collected, skip silently
            return
        
        # Call the handler first
        result = handler(event)
        
        # If it returned an awaitable (coroutine), await it.
        # This handles async def, async partials, and async callables.
        if inspect.isawaitable(result):
            await result


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
        """
        Initialize the event bus.
        
        Args:
            enable_error_recovery: If True, continue processing other handlers
                                  even if one fails
        """
        self._subscribers: Dict[Type[Event], List[EventHandlerWrapper]] = {}
        self._global_listeners: List[Callable[[Event], Awaitable[Optional[bool]]]] = []
        self.enable_error_recovery = enable_error_recovery
        self._event_stats: Dict[str, int] = {}
        self._lock = threading.RLock()  # Reentrant lock for thread safety
        # Cache for sorted handler lists per event type (MRO tuple as key)
        # Invalidated on subscribe/unsubscribe to avoid repeated sorting
        self._handler_cache: Dict[tuple, List[EventHandlerWrapper]] = {}
    
    def subscribe(
        self,
        event_type: Type[Event],
        handler: EventHandler,
        priority: int = 100,
        filter_func: Optional[Callable[[Event], bool]] = None
    ) -> None:
        """
        Subscribe a handler to an event type.
        
        Thread-safe: Uses lock to prevent race conditions during subscription.
        Invalidates handler cache for affected event types.
        
        Args:
            event_type: The type of event to subscribe to
            handler: Handler function (sync or async)
            priority: Execution priority (lower = higher priority, default: 100)
            filter_func: Optional function to filter events before calling handler
        """
        with self._lock:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []
            
            wrapper = EventHandlerWrapper(handler, priority, filter_func)
            self._subscribers[event_type].append(wrapper)
            
            # Sort by priority (lower = higher priority)
            self._subscribers[event_type].sort(key=lambda w: w.priority)
            
            # Invalidate handler cache for all event types that inherit from this one
            # (since MRO-based handler resolution may include this type)
            self._invalidate_handler_cache()
            
            logger.debug(
                f"Subscribed {handler} to {event_type.__name__} "
                f"(priority: {priority})"
            )
    
    def unsubscribe(self, event_type: Type[Event], handler: EventHandler) -> bool:
        """
        Unsubscribe a handler from an event type.
        
        Thread-safe: Uses lock to prevent race conditions during unsubscription.
        Invalidates handler cache for affected event types.
        
        Note: If the same handler is subscribed multiple times, only the first
        occurrence is removed. This matches typical usage patterns where handlers
        are subscribed once per event type.
        
        Args:
            event_type: The event type
            handler: The handler to remove
            
        Returns:
            True if handler was found and removed, False otherwise
        """
        with self._lock:
            if event_type not in self._subscribers:
                return False
            
            handlers = self._subscribers[event_type]
            for i, wrapper in enumerate(handlers):
                if wrapper.handler == handler:
                    del handlers[i]
                    # Invalidate handler cache
                    self._invalidate_handler_cache()
                    logger.debug(f"Unsubscribed {handler} from {event_type.__name__}")
                    return True
            
            return False
    
    def add_global_listener(
        self, 
        listener: Callable[[Event], Awaitable[Optional[bool]]]
    ) -> None:
        """
        Add a global listener that runs before all handlers.
        
        DESIGN: These are "before-all-handlers" listeners with blocking capability.
        Listeners can return False to prevent event propagation to handlers.
        This provides basic event filtering/veto capability.
        
        For true middleware pattern (onion architecture with pre/post processing),
        consider refactoring to pass a 'next' callable.
        
        Thread-safe: Uses lock to prevent race conditions.
        
        Args:
            listener: Async function that receives the event.
                     Returns True/None to continue, False to block propagation.
        """
        with self._lock:
            self._global_listeners.append(listener)
            logger.debug(f"Added global listener: {listener}")
    
    def add_middleware(self, middleware: Callable[[Event], Awaitable[Optional[bool]]]) -> None:
        """
        Deprecated: Use add_global_listener instead.
        
        This method is kept for backward compatibility but will be removed
        in a future version. The current implementation is not true middleware
        (onion architecture) but rather "before-all-handlers" listeners.
        """
        import warnings
        warnings.warn(
            "add_middleware is deprecated. Use add_global_listener instead.",
            DeprecationWarning,
            stacklevel=2
        )
        self.add_global_listener(middleware)
    
    def _invalidate_handler_cache(self) -> None:
        """Invalidate the handler cache (called on subscribe/unsubscribe)."""
        self._handler_cache.clear()
    
    def _get_cached_handlers(self, event_type: Type[Event]) -> Optional[List[EventHandlerWrapper]]:
        """
        Get cached sorted handlers for an event type.
        
        Args:
            event_type: The event type
            
        Returns:
            Cached handler list if available, None otherwise
        """
        # Use MRO tuple as cache key (handlers depend on inheritance hierarchy)
        mro_key = tuple(cls for cls in event_type.__mro__ if cls is not object)
        return self._handler_cache.get(mro_key)
    
    def _cache_handlers(self, event_type: Type[Event], handlers: List[EventHandlerWrapper]) -> None:
        """
        Cache sorted handlers for an event type.
        
        Args:
            event_type: The event type
            handlers: Sorted handler list to cache
        """
        mro_key = tuple(cls for cls in event_type.__mro__ if cls is not object)
        self._handler_cache[mro_key] = handlers
    
    async def publish(self, event: Event) -> None:
        """
        Publish an event to all subscribers.
        
        POLYMORPHISM: Respects inheritance hierarchy by checking all classes in
        the event's MRO (Method Resolution Order). If a handler subscribes to a
        parent class (e.g., StreamingEvent), it will receive events from child
        classes (e.g., ThinkingEvent, ToolCallEvent).
        
        Thread-safe: Copies handler list to prevent race conditions if handlers
        are added/removed during iteration.
        
        Args:
            event: The event to publish (timestamp is set in Event.__init__)
        """
        # Timestamp is set in Event.__init__, no mutation needed
        event_type = type(event)
        event_name = event_type.__name__
        
        # Update statistics (use lock for thread safety)
        with self._lock:
            self._event_stats[event_name] = self._event_stats.get(event_name, 0) + 1
        
        # Run global listeners (copy list to prevent mutation during iteration)
        # DESIGN: Listeners can block event propagation by returning False
        with self._lock:
            listeners_copy = list(self._global_listeners)
        for listener in listeners_copy:
            try:
                result = await listener(event)
                # If listener returns False, block event propagation
                if result is False:
                    logger.debug(f"Event {event_name} blocked by global listener {listener}")
                    return
            except Exception as e:
                logger.error(f"Error in global listener for {event_name}: {e}", exc_info=True)
                if not self.enable_error_recovery:
                    return  # Stop processing if error recovery is disabled
        
        # POLYMORPHISM: Collect handlers for all classes in the event's MRO
        # This ensures that subscribers to parent classes receive child events.
        # For example, if someone subscribes to StreamingEvent, they will receive
        # ThinkingEvent, ToolCallEvent, etc.
        
        # Check cache first to avoid repeated sorting
        unique_handlers = self._get_cached_handlers(event_type)
        
        if unique_handlers is None:
            # Cache miss: compute handler list
            handlers = []
            with self._lock:
                # Iterate over MRO to find all matching subscribers
                for cls in event_type.__mro__:
                    # Skip object base class
                    if cls is object:
                        continue
                    # Check if this class (or any parent) has subscribers
                    if cls in self._subscribers:
                        handlers.extend(self._subscribers[cls])
            
            # Remove duplicates while preserving order (handlers may be subscribed to multiple levels)
            # DUPLICATE EVENT DELIVERY FIX: Deduplicate by underlying handler identity, not wrapper identity
            # If the same handler is subscribed to both ParentEvent and ChildEvent, it gets two different
            # wrapper objects, but we want to execute the handler only once per event.
            seen = set()
            unique_handlers = []
            for wrapper in handlers:
                # Get the underlying handler (may be None if weak reference is dead)
                handler = wrapper.handler
                if handler is None:
                    continue  # Skip dead handlers
                # Use handler identity for deduplication, not wrapper identity
                handler_id = id(handler)
                if handler_id not in seen:
                    seen.add(handler_id)
                    unique_handlers.append(wrapper)
            
            # Sort by priority (lower = higher priority) to maintain execution order
            # across handlers from different MRO levels
            unique_handlers.sort(key=lambda w: w.priority)
            
            # Cache the result
            with self._lock:
                self._cache_handlers(event_type, unique_handlers)
        
        if not unique_handlers:
            logger.debug(f"No handlers for {event_name} (checked MRO: {[cls.__name__ for cls in event_type.__mro__ if cls is not object]})")
            return
        
        logger.debug(f"Publishing {event_name} to {len(unique_handlers)} handlers")
        
        # Execute handlers in priority order
        # MEMORY MANAGEMENT: Filter out dead handlers (from weak references) during iteration
        active_handlers = [w for w in unique_handlers if w.is_alive()]
        if len(active_handlers) < len(unique_handlers):
            # Some handlers were garbage collected, clean them up
            # Only clean the specific event types that were actually checked (from MRO)
            with self._lock:
                # Invalidate cache since handlers changed
                self._invalidate_handler_cache()
                # Only clean event types that were in the MRO (not all event types)
                for cls in event_type.__mro__:
                    if cls is object:
                        continue
                    if cls in self._subscribers:
                        self._subscribers[cls] = [
                            w for w in self._subscribers[cls] if w.is_alive()
                        ]
        
        for wrapper in active_handlers:
            try:
                await wrapper.call(event)
            except Exception as e:
                logger.error(
                    f"Error in event handler {wrapper.handler} for {event_name}: {e}",
                    exc_info=True
                )
                if not self.enable_error_recovery:
                    return  # Stop processing remaining handlers if error recovery is disabled
    
    def get_stats(self) -> Dict[str, int]:
        """
        Get event publishing statistics.
        
        Thread-safe: Uses lock to prevent race conditions during dictionary copy.
        """
        with self._lock:
            return self._event_stats.copy()
    
    def clear_stats(self) -> None:
        """
        Clear event statistics.
        
        Thread-safe: Uses lock to prevent race conditions during dictionary clear.
        """
        with self._lock:
            self._event_stats.clear()
    
    def get_subscriber_count(self, event_type: Type[Event]) -> int:
        """Get the number of subscribers for an event type."""
        return len(self._subscribers.get(event_type, []))
