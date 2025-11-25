"""
SDK Exception Classes.

This module defines exception classes used by the SDK for error handling.
All SDK-specific exceptions inherit from SDKError.
"""
class SDKError(Exception):
    """Base exception for all SDK errors."""
    pass

class ToolExecutionError(SDKError):
    """Raised when a tool fails to execute."""
    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable

class ConfigurationError(SDKError):
    """Raised when a tool is misconfigured."""
    pass

