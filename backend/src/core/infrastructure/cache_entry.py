"""Cache entry types."""
from dataclasses import dataclass, field
import time
from typing import Any


@dataclass
class CacheEntry:
    """A cache entry with value and expiration time."""
    value: Any
    expires_at: float
    created_at: float = field(default_factory=time.time)
    is_error: bool = False  # True if value is an exception (negative caching)
