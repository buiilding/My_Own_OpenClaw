"""
Infrastructure package.

Cross-cutting infrastructure components including event bus, caching, and exceptions.
"""
from backend.src.core.infrastructure.bus import EventBus, EventHandler, EventHandlerWrapper
from backend.src.core.infrastructure.cache import Cache, CacheEntry, CacheManager, cache_manager
from backend.src.core.infrastructure.exceptions import (
    BaseAppError,
    ConfigurationError,
    EmbeddingError,
    InputSizeLimitError,
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
    MemoryError,
    MemoryStoreError,
    ParseTimeoutError,
    ParseValidationError,
    SessionError,
    ToolExecutionError,
    ToolNotFoundError,
    ToolValidationError,
)

__all__ = [
    # Bus
    "EventBus",
    "EventHandler",
    "EventHandlerWrapper",
    # Cache
    "Cache",
    "CacheEntry",
    "CacheManager",
    "cache_manager",
    # Exceptions
    "BaseAppError",
    "ConfigurationError",
    "EmbeddingError",
    "InputSizeLimitError",
    "LLMAPIError",
    "LLMError",
    "LLMRateLimitError",
    "MemoryError",
    "MemoryStoreError",
    "ParseTimeoutError",
    "ParseValidationError",
    "SessionError",
    "ToolExecutionError",
    "ToolNotFoundError",
    "ToolValidationError",
]
