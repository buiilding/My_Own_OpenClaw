"""Tests for ConfigSubscriptionManager."""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.src.core.config.subscriptions import (
    ConfigSubscriptionManager,
    ConfigSubscriber,
)
from backend.src.core.config.models import AppConfig


class MockSubscriber:
    """Mock implementation of ConfigSubscriber protocol."""
    
    def __init__(self):
        self.on_config_changed = AsyncMock()


class TestConfigSubscriptionManager:
    """Tests for ConfigSubscriptionManager class."""

    @pytest.fixture
    def manager(self):
        return ConfigSubscriptionManager()

    def test_init(self, manager):
        assert manager._subscribers == []
        assert manager._callbacks == []

    def test_subscribe(self, manager):
        subscriber = MockSubscriber()
        
        manager.subscribe(subscriber)
        
        assert subscriber in manager._subscribers

    def test_subscribe_duplicate(self, manager):
        subscriber = MockSubscriber()
        
        manager.subscribe(subscriber)
        manager.subscribe(subscriber)
        
        assert manager._subscribers.count(subscriber) == 1

    def test_subscribe_callback(self, manager):
        callback = MagicMock()
        
        manager.subscribe_callback(callback)
        
        assert callback in manager._callbacks

    def test_subscribe_callback_duplicate(self, manager):
        callback = MagicMock()
        
        manager.subscribe_callback(callback)
        manager.subscribe_callback(callback)
        
        assert manager._callbacks.count(callback) == 1

    def test_unsubscribe_success(self, manager):
        subscriber = MockSubscriber()
        manager.subscribe(subscriber)
        
        result = manager.unsubscribe(subscriber)
        
        assert result is True
        assert subscriber not in manager._subscribers

    def test_unsubscribe_not_found(self, manager):
        subscriber = MockSubscriber()
        
        result = manager.unsubscribe(subscriber)
        
        assert result is False

    @pytest.mark.asyncio
    async def test_notify_subscribers(self, manager):
        subscriber1 = MockSubscriber()
        subscriber2 = MockSubscriber()
        manager.subscribe(subscriber1)
        manager.subscribe(subscriber2)
        
        old_config = AppConfig(model_provider="openai")
        new_config = AppConfig(model_provider="anthropic")
        
        await manager.notify_subscribers(old_config, new_config)
        
        subscriber1.on_config_changed.assert_called_once_with(old_config, new_config)
        subscriber2.on_config_changed.assert_called_once_with(old_config, new_config)

    @pytest.mark.asyncio
    async def test_notify_subscribers_error_handling(self, manager):
        # Create subscriber that raises an exception
        error_subscriber = MockSubscriber()
        error_subscriber.on_config_changed.side_effect = Exception("Test error")
        
        good_subscriber = MockSubscriber()
        
        manager.subscribe(error_subscriber)
        manager.subscribe(good_subscriber)
        
        old_config = AppConfig()
        new_config = AppConfig()
        
        # Should not raise exception
        await manager.notify_subscribers(old_config, new_config)
        
        # Both subscribers should still be called
        error_subscriber.on_config_changed.assert_called_once()
        good_subscriber.on_config_changed.assert_called_once()

    @pytest.mark.asyncio
    async def test_notify_callbacks_scheduled_in_thread_pool(self, manager):
        callback = MagicMock()
        manager.subscribe_callback(callback)
        
        old_config = AppConfig()
        new_config = AppConfig()
        
        await manager.notify_subscribers(old_config, new_config)
        
        # Callback should be called
        callback.assert_called_once_with(old_config, new_config)

    @pytest.mark.asyncio
    async def test_notify_callbacks_error_handling(self, manager):
        # Create callback that raises an exception
        error_callback = MagicMock(side_effect=Exception("Test error"))
        manager.subscribe_callback(error_callback)
        
        old_config = AppConfig()
        new_config = AppConfig()
        
        # Should not raise exception
        await manager.notify_subscribers(old_config, new_config)
        
        error_callback.assert_called_once()

    @pytest.mark.asyncio
    async def test_thread_safety_subscribe_during_notify(self, manager):
        """Test that subscription list is copied before iteration."""
        subscriber = MockSubscriber()
        manager.subscribe(subscriber)
        
        old_config = AppConfig()
        new_config = AppConfig()
        
        # Start notification
        task = asyncio.create_task(
            manager.notify_subscribers(old_config, new_config)
        )
        
        # Try to subscribe during notification (should not affect current iteration)
        new_subscriber = MockSubscriber()
        manager.subscribe(new_subscriber)
        
        await task
        
        # Original subscriber should have been notified
        subscriber.on_config_changed.assert_called_once()
        # New subscriber should be in list for next notification
        assert new_subscriber in manager._subscribers

    def test_thread_safety_concurrent_subscribe(self, manager):
        """Test thread safety of subscribe operation."""
        import threading
        
        subscribers = []
        errors = []
        
        def add_subscriber(i):
            try:
                subscriber = MockSubscriber()
                manager.subscribe(subscriber)
                subscribers.append(subscriber)
            except Exception as e:
                errors.append(e)
        
        threads = [
            threading.Thread(target=add_subscriber, args=(i,))
            for i in range(10)
        ]
        
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        assert len(errors) == 0
        assert len(manager._subscribers) == 10
