"""Exception type modules grouped by domain for infrastructure errors."""

from backend.src.core.infrastructure.error_types.base import BaseAppError
from backend.src.core.infrastructure.error_types.configuration import ConfigurationError
from backend.src.core.infrastructure.error_types.llm import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.infrastructure.error_types.memory import (
    EmbeddingError,
    MemoryError,
    MemoryStoreError,
)
from backend.src.core.infrastructure.error_types.session import SessionError
from backend.src.core.infrastructure.error_types.tooling import (
    ToolExecutionError,
    ToolNotFoundError,
    ToolValidationError,
)
from backend.src.core.infrastructure.error_types.trust_boundary import (
    InputSizeLimitError,
    ParseTimeoutError,
    ParseValidationError,
)

__all__ = [
    "BaseAppError",
    "ConfigurationError",
    "LLMError",
    "LLMAPIError",
    "LLMRateLimitError",
    "ToolExecutionError",
    "ToolValidationError",
    "ToolNotFoundError",
    "MemoryError",
    "MemoryStoreError",
    "EmbeddingError",
    "SessionError",
    "InputSizeLimitError",
    "ParseTimeoutError",
    "ParseValidationError",
]
