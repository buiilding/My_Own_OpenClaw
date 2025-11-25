"""
Standardized Error Handling Utilities.

This module provides utilities for consistent error handling across the system,
including result types and error handling decorators.
"""
import logging
from typing import Any, Callable, Dict, Generic, Optional, TypeVar, Union
from functools import wraps

from backend.src.core.exceptions import BaseAppError

logger = logging.getLogger(__name__)

T = TypeVar("T")
E = TypeVar("E", bound=Exception)


class Result(Generic[T, E]):
    """
    A Result type for explicit error handling.
    
    Represents either a success value or an error, making error handling
    explicit and consistent across the codebase.
    
    Usage:
        result = some_operation()
        if result.is_success:
            value = result.value
        else:
            error = result.error
    """
    
    def __init__(self, value: Optional[T] = None, error: Optional[E] = None):
        """
        Initialize a Result.
        
        Args:
            value: Success value (if successful)
            error: Error exception (if failed)
            
        Raises:
            ValueError: If both value and error are provided, or neither
        """
        if value is not None and error is not None:
            raise ValueError("Result cannot have both value and error")
        if value is None and error is None:
            raise ValueError("Result must have either value or error")
        
        self._value = value
        self._error = error
    
    @property
    def is_success(self) -> bool:
        """Check if the result is successful."""
        return self._error is None
    
    @property
    def is_error(self) -> bool:
        """Check if the result is an error."""
        return self._error is not None
    
    @property
    def value(self) -> T:
        """
        Get the success value.
        
        Raises:
            ValueError: If result is an error
        """
        if self._error is not None:
            raise ValueError(f"Cannot get value from error result: {self._error}")
        return self._value
    
    @property
    def error(self) -> E:
        """
        Get the error.
        
        Raises:
            ValueError: If result is successful
        """
        if self._error is None:
            raise ValueError("Cannot get error from success result")
        return self._error
    
    def unwrap(self) -> T:
        """
        Unwrap the value, raising the error if present.
        
        Returns:
            The success value
            
        Raises:
            The error exception if result is an error
        """
        if self._error is not None:
            raise self._error
        return self._value
    
    def unwrap_or(self, default: T) -> T:
        """
        Unwrap the value or return default if error.
        
        Args:
            default: Default value to return on error
            
        Returns:
            The success value or default
        """
        if self._error is not None:
            return default
        return self._value
    
    def map(self, func: Callable[[T], Any]) -> "Result":
        """
        Map a function over the success value.
        
        Args:
            func: Function to apply to value
            
        Returns:
            New Result with mapped value (or same error)
        """
        if self._error is not None:
            return Result(error=self._error)
        try:
            return Result(value=func(self._value))
        except Exception as e:
            return Result(error=e)
    
    def __repr__(self) -> str:
        """Return string representation."""
        if self.is_success:
            return f"Result(value={self._value!r})"
        return f"Result(error={self._error!r})"
    
    @classmethod
    def success(cls, value: T) -> "Result[T, E]":
        """Create a success result."""
        return cls(value=value)
    
    @classmethod
    def error(cls, error: E) -> "Result[T, E]":
        """Create an error result."""
        return cls(error=error)


def handle_errors(
    default_error_message: str = "An error occurred",
    log_error: bool = True,
    reraise: bool = False,
):
    """
    Decorator for standardized error handling.
    
    Wraps a function to catch exceptions and return Result types
    or handle errors consistently.
    
    Args:
        default_error_message: Default error message if exception has no message
        log_error: Whether to log errors
        reraise: Whether to re-raise exceptions (for backward compatibility)
        
    Usage:
        @handle_errors()
        async def my_function():
            return some_value
        
        result = await my_function()
        if result.is_success:
            value = result.value
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            try:
                result = await func(*args, **kwargs)
                return Result.success(result)
            except BaseAppError as e:
                if log_error:
                    logger.error(f"Error in {func.__name__}: {e}", exc_info=True)
                if reraise:
                    raise
                return Result.error(e)
            except Exception as e:
                if log_error:
                    logger.error(f"Unexpected error in {func.__name__}: {e}", exc_info=True)
                # Wrap in BaseAppError for consistency
                wrapped_error = BaseAppError(
                    message=default_error_message,
                    cause=e,
                    metadata={"function": func.__name__}
                )
                if reraise:
                    raise wrapped_error
                return Result.error(wrapped_error)
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                result = func(*args, **kwargs)
                return Result.success(result)
            except BaseAppError as e:
                if log_error:
                    logger.error(f"Error in {func.__name__}: {e}", exc_info=True)
                if reraise:
                    raise
                return Result.error(e)
            except Exception as e:
                if log_error:
                    logger.error(f"Unexpected error in {func.__name__}: {e}", exc_info=True)
                wrapped_error = BaseAppError(
                    message=default_error_message,
                    cause=e,
                    metadata={"function": func.__name__}
                )
                if reraise:
                    raise wrapped_error
                return Result.error(wrapped_error)
        
        # Return appropriate wrapper based on whether function is async
        import inspect
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


def safe_execute(
    func: Callable,
    *args,
    default: Optional[T] = None,
    log_error: bool = True,
    **kwargs
) -> Union[T, None]:
    """
    Safely execute a function, returning None on error.
    
    Args:
        func: Function to execute
        *args: Positional arguments
        default: Default value to return on error
        log_error: Whether to log errors
        **kwargs: Keyword arguments
        
    Returns:
        Function result or default/None on error
    """
    try:
        return func(*args, **kwargs)
    except Exception as e:
        if log_error:
            logger.error(f"Error executing {func.__name__}: {e}", exc_info=True)
        return default


async def safe_execute_async(
    func: Callable,
    *args,
    default: Optional[T] = None,
    log_error: bool = True,
    **kwargs
) -> Union[T, None]:
    """
    Safely execute an async function, returning None on error.
    
    Args:
        func: Async function to execute
        *args: Positional arguments
        default: Default value to return on error
        log_error: Whether to log errors
        **kwargs: Keyword arguments
        
    Returns:
        Function result or default/None on error
    """
    try:
        return await func(*args, **kwargs)
    except Exception as e:
        if log_error:
            logger.error(f"Error executing {func.__name__}: {e}", exc_info=True)
        return default

