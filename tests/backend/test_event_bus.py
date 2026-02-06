"""Tests for EventBus and related classes."""
import asyncio
import pytest
import weakref
from unittest.mock import AsyncMock, MagicMock, patch

from backend.src.core.infrastructure.bus import EventBus, EventHandlerWrapper
from backend.src.core.events.base import Event


class TestEvent(Event):
    """Test event for unit tests."""
    pass


class AnotherTestEvent(Event):
    """Another test event for unit tests."""
    pass


class TestEventHandlerWrapper:
    """Tests for EventHandlerWrapper class."""

    def test_init_with_function(self):
        def handler(event):
            pass
        
        wrapper = EventHandlerWrapper(handler)
        
        assert wrapper.handler is handler
        assert wrapper.priority == 100
        assert wrapper.filter_func is None
        assert not wrapper._is_weak

    def test_init_with_bound_method(self):
        class MyClass:
            def handler(self, event):
                pass
        
        obj = MyClass()
        wrapper = EventHandlerWrapper(obj.handler)
        
        assert wrapper._is_weak
        assert wrapper.handler is obj.handler

    def test_init_with_priority_and_filter(self):
        def handler(event):
            pass
        
        def filter_func(event):
            return True
        
        wrapper = EventHandlerWrapper(handler, priority=50, filter_func=filter_func)
        
        assert wrapper.priority == 50
        assert wrapper.filter_func is filter_func

    def test_handler_with_dead_weak_reference(self):
        class MyClass:
            def handler(self, event):
                pass
        
        obj = MyClass()
        wrapper = EventHandlerWrapper(obj.handler)
        
        # Delete the object
        del obj
        
        # Handler should be None due to weak reference
        assert wrapper.handler is None
        assert not wrapper.is_alive()

    def test_is_alive_with_function(self):
        def handler(event):
            pass
        
        wrapper = EventHandlerWrapper(handler)
        assert wrapper.is_alive()

    @pytest.mark.asyncio
    async def test_call_sync_handler(self):
        called = []
        
        def handler(event):
            called.append(event)
        
        wrapper = EventHandlerWrapper(handler)
        event = TestEvent()
        
        await wrapper.call(event)
        
        assert called == [event]

    @pytest.mark.asyncio
    async def test_call_async_handler(self):
        called = []
        
        async def handler(event):
            called.append(event)
        
        wrapper = EventHandlerWrapper(handler)
        event = TestEvent()
        
        await wrapper.call(event)
        
        assert called == [event]

    @pytest.mark.asyncio
    async def test_call_with_filter(self):
        called = []
        
        def handler(event):
            called.append(event)
        
        def filter_func(event):
            return isinstance(event, AnotherTestEvent)
        
        wrapper = EventHandlerWrapper(handler, filter_func=filter_func)
        
        await wrapper.call(TestEvent())
        assert called == []  # Filtered out
        
        await wrapper.call(AnotherTestEvent())
        assert len(called) == 1

    @pytest.mark.asyncio
    async def test_call_with_dead_handler(self):
        class MyClass:
            def handler(self, event):
                pass
        
        obj = MyClass()
        wrapper = EventHandlerWrapper(obj.handler)
        del obj
        
        # Should not raise
        await wrapper.call(TestEvent())


class TestEventBus:
    """Tests for EventBus class."""

    @pytest.fixture
    def bus(self):
        return EventBus()

    def test_init(self, bus):
        assert bus._subscribers == {}
        assert bus._global_listeners == []
        assert bus.enable_error_recovery is True
        assert bus._event_stats == {}
        assert bus._handler_cache == {}

    def test_subscribe(self, bus):
        def handler(event):
            pass
        
        bus.subscribe(TestEvent, handler)
        
        assert TestEvent in bus._subscribers
        assert len(bus._subscribers[TestEvent]) == 1
        assert bus._subscribers[TestEvent][0].handler is handler

    def test_subscribe_with_priority(self, bus):
        def handler1(event):
            pass
        
        def handler2(event):
            pass
        
        bus.subscribe(TestEvent, handler1, priority=200)
        bus.subscribe(TestEvent, handler2, priority=50)
        
        # Lower priority should come first
        assert bus._subscribers[TestEvent][0].handler is handler2
        assert bus._subscribers[TestEvent][1].handler is handler1

    def test_subscribe_invalidates_cache(self, bus):
        def handler(event):
            pass
        
        bus._handler_cache = {(TestEvent,): []}
        bus.subscribe(TestEvent, handler)
        
        assert bus._handler_cache == {}

    def test_unsubscribe(self, bus):
        def handler(event):
            pass
        
        bus.subscribe(TestEvent, handler)
        result = bus.unsubscribe(TestEvent, handler)
        
        assert result is True
        assert len(bus._subscribers[TestEvent]) == 0

    def test_unsubscribe_not_found(self, bus):
        def handler(event):
            pass
        
        result = bus.unsubscribe(TestEvent, handler)
        assert result is False

    def test_unsubscribe_invalidates_cache(self, bus):
        def handler(event):
            pass
        
        bus.subscribe(TestEvent, handler)
        bus._handler_cache = {(TestEvent,): []}
        bus.unsubscribe(TestEvent, handler)
        
        assert bus._handler_cache == {}

    def test_add_global_listener(self, bus):
        async def listener(event):
            return True
        
        bus.add_global_listener(listener)
        
        assert listener in bus._global_listeners

    def test_add_middleware_deprecated(self, bus):
        async def middleware(event):
            return True
        
        with pytest.warns(DeprecationWarning):
            bus.add_middleware(middleware)
        
        assert middleware in bus._global_listeners

    @pytest.mark.asyncio
    async def test_publish_no_handlers(self, bus):
        event = TestEvent()
        
        # Should not raise
        await bus.publish(event)
        
        assert bus._event_stats.get("TestEvent") == 1

    @pytest.mark.asyncio
    async def test_publish_with_handler(self, bus):
        called = []
        
        def handler(event):
            called.append(event)
        
        bus.subscribe(TestEvent, handler)
        event = TestEvent()
        
        await bus.publish(event)
        
        assert called == [event]

    @pytest.mark.asyncio
    async def test_publish_with_multiple_handlers(self, bus):
        called = []
        
        def handler1(event):
            called.append("handler1")
        
        def handler2(event):
            called.append("handler2")
        
        bus.subscribe(TestEvent, handler1)
        bus.subscribe(TestEvent, handler2)
        
        await bus.publish(TestEvent())
        
        assert "handler1" in called
        assert "handler2" in called

    @pytest.mark.asyncio
    async def test_publish_with_global_listener(self, bus):
        called = []
        
        async def listener(event):
            called.append("listener")
            return True
        
        bus.add_global_listener(listener)
        
        await bus.publish(TestEvent())
        
        assert "listener" in called

    @pytest.mark.asyncio
    async def test_publish_global_listener_blocks(self, bus):
        called = []
        
        async def listener(event):
            return False  # Block propagation
        
        def handler(event):
            called.append("handler")
        
        bus.add_global_listener(listener)
        bus.subscribe(TestEvent, handler)
        
        await bus.publish(TestEvent())
        
        assert "handler" not in called

    @pytest.mark.asyncio
    async def test_publish_with_error_recovery(self, bus):
        called = []
        
        def bad_handler(event):
            raise ValueError("Oops")
        
        def good_handler(event):
            called.append("good")
        
        bus.subscribe(TestEvent, bad_handler)
        bus.subscribe(TestEvent, good_handler)
        
        # Should not raise, should continue to good_handler
        await bus.publish(TestEvent())
        
        assert called == ["good"]

    @pytest.mark.asyncio
    async def test_publish_without_error_recovery(self):
        bus = EventBus(enable_error_recovery=False)
        
        def bad_handler(event):
            raise ValueError("Oops")
        
        def good_handler(event):
            pass
        
        bus.subscribe(TestEvent, bad_handler)
        bus.subscribe(TestEvent, good_handler)
        
        # Should not raise but should stop after bad_handler
        await bus.publish(TestEvent())

    @pytest.mark.asyncio
    async def test_publish_polymorphism(self, bus):
        """Test that handlers for parent events receive child events."""
        called = []
        
        class ParentEvent(Event):
            pass
        
        class ChildEvent(ParentEvent):
            pass
        
        def handler(event):
            called.append(type(event).__name__)
        
        bus.subscribe(ParentEvent, handler)
        
        await bus.publish(ChildEvent())
        
        assert "ChildEvent" in called

    def test_get_stats(self, bus):
        bus._event_stats = {"TestEvent": 5, "AnotherEvent": 3}
        
        stats = bus.get_stats()
        
        assert stats == {"TestEvent": 5, "AnotherEvent": 3}

    def test_clear_stats(self, bus):
        bus._event_stats = {"TestEvent": 5}
        
        bus.clear_stats()
        
        assert bus._event_stats == {}

    def test_get_subscriber_count(self, bus):
        def handler1(event):
            pass
        
        def handler2(event):
            pass
        
        bus.subscribe(TestEvent, handler1)
        bus.subscribe(TestEvent, handler2)
        
        assert bus.get_subscriber_count(TestEvent) == 2
        assert bus.get_subscriber_count(AnotherTestEvent) == 0

    def test_handler_caching(self, bus):
        def handler(event):
            pass
        
        bus.subscribe(TestEvent, handler)
        
        # First call should build and cache handlers
        handlers1 = bus._get_or_build_handlers(TestEvent)
        
        # Second call should use cache
        handlers2 = bus._get_cached_handlers(TestEvent)
        
        assert handlers1 == handlers2

    def test_cleanup_dead_handlers(self, bus):
        class MyClass:
            def handler(self, event):
                pass
        
        obj = MyClass()
        bus.subscribe(TestEvent, obj.handler)
        
        # Delete the object
        del obj
        
        # Cleanup should remove dead handlers
        bus._cleanup_dead_handlers(TestEvent)
        
        assert len(bus._subscribers[TestEvent]) == 0

    def test_thread_safety_concurrent_subscribe(self, bus):
        import threading
        
        def make_handler(i):
            def handler(event):
                pass
            return handler
        
        errors = []
        
        def subscribe_handler(i):
            try:
                bus.subscribe(TestEvent, make_handler(i))
            except Exception as e:
                errors.append(e)
        
        threads = [
            threading.Thread(target=subscribe_handler, args=(i,))
            for i in range(10)
        ]
        
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        assert len(errors) == 0
        assert bus.get_subscriber_count(TestEvent) == 10
