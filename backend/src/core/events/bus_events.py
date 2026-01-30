"""
Event Bus Events.

This module provides event bus events for internal component communication.
"""
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from backend.src.core.events.base import Event

if TYPE_CHECKING:
    from backend.src.core.config import AppConfig


@dataclass
class InteractionCompleted(Event):
    """Event fired when a conversation turn completes."""
    session_id: str
    user_id: str
    user_message: str
    assistant_response: str
    timestamp: Optional[float] = None
    
    def __post_init__(self):
        """Initialize parent and set timestamp."""
        super().__init__(self.timestamp)


@dataclass
class ConfigChanged(Event):
    """Event fired when configuration is updated."""
    old_config: "AppConfig"
    new_config: "AppConfig"
    timestamp: Optional[float] = None
    
    def __post_init__(self):
        """Initialize parent and set timestamp."""
        super().__init__(self.timestamp)
