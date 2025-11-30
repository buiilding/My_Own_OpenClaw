"""
Configuration Subscription Manager.

Handles subscription management for configuration change notifications.
Separates subscriber management from configuration data access.
"""
import logging
from typing import Any, Callable, List, Protocol

from backend.src.core.config import AppConfig

logger = logging.getLogger(__name__)


class ConfigSubscriber(Protocol):
    """Protocol for components that subscribe to config changes."""

    async def on_config_changed(
        self, old_config: AppConfig, new_config: AppConfig
    ) -> None:
        """
        Called when configuration changes.

        Args:
            old_config: Previous configuration
            new_config: New configuration
        """
        ...


class ConfigSubscriptionManager:
    """
    Manages subscriptions to configuration changes.

    Handles both protocol-based subscribers and callback functions.
    Separates subscription management from configuration data access.
    """

    def __init__(self):
        """Initialize the subscription manager."""
        self._subscribers: List[ConfigSubscriber] = []
        self._callbacks: List[Callable[[AppConfig, AppConfig], None]] = []

    def subscribe(self, subscriber: ConfigSubscriber) -> None:
        """
        Subscribe to configuration changes.

        Args:
            subscriber: Object implementing ConfigSubscriber protocol
        """
        if subscriber not in self._subscribers:
            self._subscribers.append(subscriber)
            logger.debug(f"Subscribed {type(subscriber).__name__} to config changes")

    def subscribe_callback(
        self, callback: Callable[[AppConfig, AppConfig], None]
    ) -> None:
        """
        Subscribe a callback function to configuration changes.

        Args:
            callback: Function that takes (old_config, new_config) as arguments
        """
        if callback not in self._callbacks:
            self._callbacks.append(callback)
            logger.debug("Subscribed callback to config changes")

    def unsubscribe(self, subscriber: ConfigSubscriber) -> bool:
        """
        Unsubscribe from configuration changes.

        Args:
            subscriber: Subscriber to remove

        Returns:
            True if subscriber was found and removed, False otherwise
        """
        if subscriber in self._subscribers:
            self._subscribers.remove(subscriber)
            logger.debug(
                f"Unsubscribed {type(subscriber).__name__} from config changes"
            )
            return True
        return False

    async def notify_subscribers(
        self, old_config: AppConfig, new_config: AppConfig
    ) -> None:
        """
        Notify all subscribers of configuration change.

        Args:
            old_config: Previous configuration
            new_config: New configuration
        """
        # Notify protocol-based subscribers
        for subscriber in self._subscribers:
            try:
                if hasattr(subscriber, "on_config_changed"):
                    await subscriber.on_config_changed(old_config, new_config)
            except Exception as e:
                logger.error(
                    f"Error notifying subscriber {type(subscriber).__name__}: {e}",
                    exc_info=True,
                )

        # Notify callback subscribers
        for callback in self._callbacks:
            try:
                callback(old_config, new_config)
            except Exception as e:
                logger.error(f"Error in config change callback: {e}", exc_info=True)
