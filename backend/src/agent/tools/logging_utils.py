"""
Logging utilities for agent tools.

Pure helpers with no side effects beyond their direct return values.
"""


def short_id(request_id: str, length: int = 15) -> str:
    """Truncate request_id to specified length for logging."""
    return request_id[:length] if request_id else "unknown"

