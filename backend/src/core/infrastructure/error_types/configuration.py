"""Configuration-specific exception types."""

from typing import Any, Dict, Optional

from backend.src.core.infrastructure.error_types.base import BaseAppError, _merge_metadata_if


class ConfigurationError(BaseAppError):
    """Raised when there's an error with application configuration."""

    def __init__(
        self,
        message: str,
        config_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="CONFIG_ERROR",
            metadata=_merge_metadata_if(metadata, bool(config_key), config_key=config_key),
            cause=cause,
        )
        self.config_key = config_key
