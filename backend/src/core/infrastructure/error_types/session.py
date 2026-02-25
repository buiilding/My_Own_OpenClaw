"""Session-related exception types."""

from typing import Any, Dict, Optional

from backend.src.core.infrastructure.error_types.base import BaseAppError, _merge_metadata_if


class SessionError(BaseAppError):
    """Raised when there's an error with agent sessions."""

    def __init__(
        self,
        message: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="SESSION_ERROR",
            metadata=_merge_metadata_if(
                metadata,
                bool(session_id or user_id),
                session_id=session_id,
                user_id=user_id,
            ),
            cause=cause,
        )
        self.session_id = session_id
        self.user_id = user_id
