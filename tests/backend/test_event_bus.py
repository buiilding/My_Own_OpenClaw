"""Tests for EventBus and related classes."""
import asyncio
import gc
import threading
import pytest
import weakref
from unittest.mock import AsyncMock, MagicMock, patch

from backend.src.core.infrastructure.bus import EventBus, EventHandlerWrapper
from backend.src.core.infrastructure.event_bus_registry import EventHandlerStore
from backend.src.core.events.base import Event


class MockEvent(Event):
    """Mock event for unit tests."""
    pass


class AnotherMockEvent(Event):
    """Another mock event for unit tests."""
    pass


class ParentEvent(Event):
    """Parent event for handler-store tests."""


class ChildEvent(ParentEvent):
    """Child event for handler-store tests."""


class _HandlerOwner:
    def on_event(self, event):
        return None


class MockEventHandlerWrapper:
    """Tests for EventHandlerWrapper class."""

    @staticmethod
    async def _invoke(handler):
        wrapper = EventHandlerWrapper(handler)
        event = MockEvent()
        await wrapper.call(event)
        return event

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
        original_handler = obj.handler
        wrapper = EventHandlerWrapper(original_handler)
        
        assert wrapper._is_weak
        # The handler might be a different bound method object but for same method
        assert wrapper.handler.__func__ is original_handler.__func__

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

        event = await self._invoke(handler)
        assert called == [event]

    @pytest.mark.asyncio
    async def test_call_async_handler(self):
        called = []

        async def handler(event):
            called.append(event)

        event = await self._invoke(handler)
        assert called == [event]

    @pytest.mark.asyncio
    async def test_call_with_filter(self):
        called = []
        
        def handler(event):
            called.append(event)
        
        def filter_func(event):
            return isinstance(event, AnotherMockEvent)
        
        wrapper = EventHandlerWrapper(handler, filter_func=filter_func)
        
        await wrapper.call(MockEvent())
        assert called == []  # Filtered out
        
        await wrapper.call(AnotherMockEvent())
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
        await wrapper.call(MockEvent())


class MockEventBus:
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
        
        bus.subscribe(MockEvent, handler)
        
        assert MockEvent in bus._subscribers
        assert len(bus._subscribers[MockEvent]) == 1
        assert bus._subscribers[MockEvent][0].handler is handler

    def test_subscribe_with_priority(self, bus):
        def handler1(event):
            pass
        
        def handler2(event):
            pass
        
        bus.subscribe(MockEvent, handler1, priority=200)
        bus.subscribe(MockEvent, handler2, priority=50)
        
        # Lower priority should come first
        assert bus._subscribers[MockEvent][0].handler is handler2
        assert bus._subscribers[MockEvent][1].handler is handler1

    def test_subscribe_invalidates_cache(self, bus):
        def handler(event):
            pass
        
        bus._handler_cache = {(MockEvent,): []}
        bus.subscribe(MockEvent, handler)
        
        assert bus._handler_cache == {}

    def test_unsubscribe(self, bus):
        def handler(event):
            pass
        
        bus.subscribe(MockEvent, handler)
        result = bus.unsubscribe(MockEvent, handler)
        
        assert result is True
        assert len(bus._subscribers[MockEvent]) == 0

    def test_unsubscribe_not_found(self, bus):
        def handler(event):
            pass
        
        result = bus.unsubscribe(MockEvent, handler)
        assert result is False

    def test_unsubscribe_invalidates_cache(self, bus):
        def handler(event):
            pass
        
        bus.subscribe(MockEvent, handler)
        bus._handler_cache = {(MockEvent,): []}
        bus.unsubscribe(MockEvent, handler)
        
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
        event = MockEvent()
        
        # Should not raise
        await bus.publish(event)
        
        assert bus._event_stats.get("MockEvent") == 1

    @pytest.mark.asyncio
    async def test_publish_with_handler(self, bus):
        called = []
        
        def handler(event):
            called.append(event)
        
        bus.subscribe(MockEvent, handler)
        event = MockEvent()
        
        await bus.publish(event)
        
        assert called == [event]

    @pytest.mark.asyncio
    async def test_publish_with_multiple_handlers(self, bus):
        called = []
        
        def handler1(event):
            called.append("handler1")
        
        def handler2(event):
            called.append("handler2")
        
        bus.subscribe(MockEvent, handler1)
        bus.subscribe(MockEvent, handler2)
        
        await bus.publish(MockEvent())
        
        assert "handler1" in called
        assert "handler2" in called

    @pytest.mark.asyncio
    async def test_publish_with_global_listener(self, bus):
        called = []
        
        async def listener(event):
            called.append("listener")
            return True
        
        bus.add_global_listener(listener)
        
        await bus.publish(MockEvent())
        
        assert "listener" in called

    @pytest.mark.asyncio
    async def test_publish_global_listener_blocks(self, bus):
        called = []
        
        async def listener(event):
            return False  # Block propagation
        
        def handler(event):
            called.append("handler")
        
        bus.add_global_listener(listener)
        bus.subscribe(MockEvent, handler)
        
        await bus.publish(MockEvent())
        
        assert "handler" not in called

    @pytest.mark.asyncio
    async def test_publish_with_error_recovery(self, bus):
        called = []
        
        def bad_handler(event):
            raise ValueError("Oops")
        
        def good_handler(event):
            called.append("good")
        
        bus.subscribe(MockEvent, bad_handler)
        bus.subscribe(MockEvent, good_handler)
        
        # Should not raise, should continue to good_handler
        await bus.publish(MockEvent())
        
        assert called == ["good"]

    @pytest.mark.asyncio
    async def test_publish_without_error_recovery(self):
        bus = EventBus(enable_error_recovery=False)
        
        def bad_handler(event):
            raise ValueError("Oops")
        
        def good_handler(event):
            pass
        
        bus.subscribe(MockEvent, bad_handler)
        bus.subscribe(MockEvent, good_handler)
        
        # Should not raise but should stop after bad_handler
        await bus.publish(MockEvent())

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
        bus._event_stats = {"MockEvent": 5, "AnotherEvent": 3}
        
        stats = bus.get_stats()
        
        assert stats == {"MockEvent": 5, "AnotherEvent": 3}

    def test_clear_stats(self, bus):
        bus._event_stats = {"MockEvent": 5}
        
        bus.clear_stats()
        
        assert bus._event_stats == {}

    def test_get_subscriber_count(self, bus):
        def handler1(event):
            pass
        
        def handler2(event):
            pass
        
        bus.subscribe(MockEvent, handler1)
        bus.subscribe(MockEvent, handler2)
        
        assert bus.get_subscriber_count(MockEvent) == 2
        assert bus.get_subscriber_count(AnotherMockEvent) == 0

    def test_handler_caching(self, bus):
        def handler(event):
            pass
        
        bus.subscribe(MockEvent, handler)
        
        # First call should build and cache handlers
        handlers1 = bus._get_or_build_handlers(MockEvent)
        
        # Second call should use cache
        handlers2 = bus._get_cached_handlers(MockEvent)
        
        assert handlers1 == handlers2

    def test_cleanup_dead_handlers(self, bus):
        class MyClass:
            def handler(self, event):
                pass
        
        obj = MyClass()
        bus.subscribe(MockEvent, obj.handler)
        
        # Delete the object
        del obj
        
        # Cleanup should remove dead handlers
        bus._cleanup_dead_handlers(MockEvent)
        
        assert len(bus._subscribers[MockEvent]) == 0

    def test_thread_safety_concurrent_subscribe(self, bus):
        import threading
        
        def make_handler(i):
            def handler(event):
                pass
            return handler
        
        errors = []
        
        def subscribe_handler(i):
            try:
                bus.subscribe(MockEvent, make_handler(i))
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
        assert bus.get_subscriber_count(MockEvent) == 10


class TestEventHandlerStore:
    def test_resolve_handlers_orders_by_priority_across_mro(self):
        store = EventHandlerStore(threading.RLock())

        def parent_handler(event):
            return None

        def child_handler(event):
            return None

        store.subscribe(ParentEvent, parent_handler, priority=200)
        store.subscribe(ChildEvent, child_handler, priority=50)

        resolved = store.resolve_handlers(ChildEvent)

        assert [wrapper.handler for wrapper in resolved] == [
            child_handler,
            parent_handler,
        ]

    def test_resolve_handlers_dedupes_same_handler_registered_twice(self):
        store = EventHandlerStore(threading.RLock())

        def shared_handler(event):
            return None

        store.subscribe(ParentEvent, shared_handler, priority=80)
        store.subscribe(ChildEvent, shared_handler, priority=10)

        resolved = store.resolve_handlers(ChildEvent)

        assert len(resolved) == 1
        assert resolved[0].handler is shared_handler
        assert resolved[0].priority == 10

    def test_handler_cache_invalidates_on_subscribe_and_unsubscribe(self):
        store = EventHandlerStore(threading.RLock())

        def handler_one(event):
            return None

        def handler_two(event):
            return None

        store.subscribe(ChildEvent, handler_one)
        first = store.resolve_handlers(ChildEvent)
        cached = store.resolve_handlers(ChildEvent)
        assert cached is first

        store.subscribe(ChildEvent, handler_two)
        after_subscribe = store.resolve_handlers(ChildEvent)
        assert after_subscribe is not first
        assert len(after_subscribe) == 2

        assert store.unsubscribe(ChildEvent, handler_two) is True
        after_unsubscribe = store.resolve_handlers(ChildEvent)
        assert after_unsubscribe is not after_subscribe
        assert [wrapper.handler for wrapper in after_unsubscribe] == [handler_one]

    def test_filter_active_handlers_removes_dead_bound_method_subscribers(self):
        store = EventHandlerStore(threading.RLock())

        owner = _HandlerOwner()
        store.subscribe(ChildEvent, owner.on_event)

        resolved = store.resolve_handlers(ChildEvent)
        assert len(resolved) == 1

        del owner
        gc.collect()

        active = store.filter_active_handlers(resolved, ChildEvent)

        assert active == []
        assert store.get_subscriber_count(ChildEvent) == 0
        assert store.resolve_handlers(ChildEvent) == []

    @pytest.mark.asyncio
    async def test_wrapper_awaits_awaitable_return_and_honors_filter(self):
        calls = []

        async def async_target(event):
            calls.append(type(event).__name__)

        def handler(event):
            return async_target(event)

        wrapper = EventHandlerWrapper(
            handler,
            filter_func=lambda event: isinstance(event, ChildEvent),
        )

        await wrapper.call(ParentEvent())
        await wrapper.call(ChildEvent())

        assert calls == ["ChildEvent"]

    def test_unsubscribe_bound_method_with_new_method_reference(self):
        store = EventHandlerStore(threading.RLock())

        owner = _HandlerOwner()
        store.subscribe(ChildEvent, owner.on_event)

        # Accessing the bound method again creates a new method object.
        assert store.unsubscribe(ChildEvent, owner.on_event) is True
        assert store.get_subscriber_count(ChildEvent) == 0

    def test_iter_event_classes_caches_mro_without_object(self):
        store = EventHandlerStore(threading.RLock())

        classes_one = store.iter_event_classes(ChildEvent)
        classes_two = store.iter_event_classes(ChildEvent)

        assert classes_one is classes_two
        assert classes_one[0] is ChildEvent
        assert ParentEvent in classes_one
        assert Event in classes_one
        assert object not in classes_one


class TestEventBusRuntime:
    @pytest.mark.asyncio
    async def test_publish_respects_priority_across_child_and_parent_handlers(self):
        bus = EventBus()
        calls = []

        def parent_handler(event):
            calls.append("parent")

        def child_handler(event):
            calls.append("child")

        bus.subscribe(ParentEvent, parent_handler, priority=200)
        bus.subscribe(ChildEvent, child_handler, priority=50)

        await bus.publish(ChildEvent())

        assert calls == ["child", "parent"]

    @pytest.mark.asyncio
    async def test_global_listener_can_block_handler_execution(self):
        bus = EventBus()
        calls = []

        async def blocker(event):
            return False

        def handler(event):
            calls.append("handler")

        bus.add_global_listener(blocker)
        bus.subscribe(ChildEvent, handler)

        await bus.publish(ChildEvent())

        assert calls == []

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("enable_error_recovery", "expected_calls"),
        [(True, ["good"]), (False, [])],
        ids=["recovery-enabled", "recovery-disabled"],
    )
    async def test_error_recovery_behavior(self, enable_error_recovery, expected_calls):
        bus = EventBus(enable_error_recovery=enable_error_recovery)
        calls = []

        def bad_handler(event):
            raise RuntimeError("boom")

        def good_handler(event):
            calls.append("good")

        bus.subscribe(ChildEvent, bad_handler, priority=10)
        bus.subscribe(ChildEvent, good_handler, priority=20)

        await bus.publish(ChildEvent())

        assert calls == expected_calls

    @pytest.mark.asyncio
    async def test_publish_ignores_dead_weak_method_handlers(self):
        bus = EventBus()
        calls = []

        class Owner:
            def handler(self, event):
                return None

        def live_handler(event):
            calls.append("live")

        owner = Owner()
        bus.subscribe(ChildEvent, owner.handler)
        bus.subscribe(ChildEvent, live_handler)

        del owner
        gc.collect()

        await bus.publish(ChildEvent())

        assert calls == ["live"]
