"""Backward-compatible exception export facade.

The exception hierarchy now lives in `core.infrastructure.error_types`.
This module keeps stable import paths for existing callers.
"""

from backend.src.core.infrastructure.error_types import (
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
    __all__ as _error_types_public_exports,
)
from backend.src.core.infrastructure.error_types.base import (
    _init_optional_scoped_context_error,
    _init_scoped_context_error,
    _merge_metadata_if,
    _merge_trust_boundary_metadata,
    _metadata_with_optional_field,
)
from backend.src.core.infrastructure.error_types.llm import _LLMOptionalFieldError
from backend.src.core.infrastructure.error_types.trust_boundary import _TrustBoundaryError

__all__ = list(_error_types_public_exports)
