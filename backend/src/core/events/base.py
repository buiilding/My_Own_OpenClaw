"""
Base Event class for Event Bus.

This module provides the base Event class used by all event bus events.
"""
import time
from typing import Optional


class Event:
    """Base class for all event bus events."""
    def __init__(self, timestamp: Optional[float] = None):
        """Initialize event with optional timestamp."""
        self.timestamp = timestamp if timestamp is not None else time.time()
