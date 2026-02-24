# @file purpose: Observability module for browser-use that handles optional lmnr integration with debug mode support
"""
Observability module for browser-use

This module provides observability decorators that optionally integrate with lmnr (Laminar) for tracing.
If lmnr is not installed, it provides no-op wrappers that accept the same parameters.

Features:
- Optional lmnr integration - works with or without lmnr installed
- Debug mode support - observe_debug only traces when in debug mode
- Full parameter compatibility with lmnr observe decorator
- No-op fallbacks when lmnr is unavailable
"""

import logging
import os
from collections.abc import Callable
from functools import wraps
from typing import Any, Literal, TypeVar, cast

logger = logging.getLogger(__name__)
from dotenv import load_dotenv

load_dotenv()

# Type definitions
F = TypeVar('F', bound=Callable[..., Any])


# Check if we're in debug mode
def _is_debug_mode() -> bool:
	"""Check if we're in debug mode based on environment variables or logging level."""

	lmnr_debug_mode = os.getenv('LMNR_LOGGING_LEVEL', '').lower()
	if lmnr_debug_mode == 'debug':
		# logger.info('Debug mode is enabled for observability')
		return True
	# logger.info('Debug mode is disabled for observability')
	return False


# Try to import lmnr observe
_LMNR_AVAILABLE = False
_lmnr_observe = None

try:
	from lmnr import observe as _lmnr_observe  # type: ignore

	if os.environ.get('BROWSER_USE_VERBOSE_OBSERVABILITY', 'false').lower() == 'true':
		logger.debug('Lmnr is available for observability')
	_LMNR_AVAILABLE = True
except ImportError:
	if os.environ.get('BROWSER_USE_VERBOSE_OBSERVABILITY', 'false').lower() == 'true':
		logger.debug('Lmnr is not available for observability')
	_LMNR_AVAILABLE = False


def _create_no_op_decorator(
	name: str | None = None,
	ignore_input: bool = False,
	ignore_output: bool = False,
	metadata: dict[str, Any] | None = None,
	**kwargs: Any,
) -> Callable[[F], F]:
	"""Create a no-op decorator that accepts all lmnr observe parameters but does nothing."""
	import asyncio

	def decorator(func: F) -> F:
		if asyncio.iscoroutinefunction(func):

			@wraps(func)
			async def async_wrapper(*args, **kwargs):
				return await func(*args, **kwargs)

			return cast(F, async_wrapper)
		else:

			@wraps(func)
			def sync_wrapper(*args, **kwargs):
				return func(*args, **kwargs)

			return cast(F, sync_wrapper)

	return decorator


def _build_observe_kwargs(
	*,
	name: str | None,
	ignore_input: bool,
	ignore_output: bool,
	metadata: dict[str, Any] | None,
	span_type: Literal['DEFAULT', 'LLM', 'TOOL'],
	tags: list[str],
	extra_kwargs: dict[str, Any],
) -> dict[str, Any]:
	"""Build kwargs payload for lmnr observe/no-op decorators."""
	return {
		'name': name,
		'ignore_input': ignore_input,
		'ignore_output': ignore_output,
		'metadata': metadata,
		'span_type': span_type,
		'tags': tags,  # important: tags need to be created on laminar first
		**extra_kwargs,
	}


def _resolve_observe_decorator(*, decorator_kwargs: dict[str, Any], enable_trace: bool) -> Callable[[F], F]:
	"""Resolve to lmnr decorator when enabled and available, else no-op."""
	if enable_trace and _LMNR_AVAILABLE and _lmnr_observe:
		return cast(Callable[[F], F], _lmnr_observe(**decorator_kwargs))
	return _create_no_op_decorator(**decorator_kwargs)


def _observe_with_tags(
	*,
	name: str | None,
	ignore_input: bool,
	ignore_output: bool,
	metadata: dict[str, Any] | None,
	span_type: Literal['DEFAULT', 'LLM', 'TOOL'],
	tags: list[str],
	enable_trace: bool,
	extra_kwargs: dict[str, Any],
) -> Callable[[F], F]:
	"""Build and resolve observe decorator for a tag set."""
	decorator_kwargs = _build_observe_kwargs(
		name=name,
		ignore_input=ignore_input,
		ignore_output=ignore_output,
		metadata=metadata,
		span_type=span_type,
		tags=tags,
		extra_kwargs=extra_kwargs,
	)
	return _resolve_observe_decorator(decorator_kwargs=decorator_kwargs, enable_trace=enable_trace)


def observe(
	name: str | None = None,
	ignore_input: bool = False,
	ignore_output: bool = False,
	metadata: dict[str, Any] | None = None,
	span_type: Literal['DEFAULT', 'LLM', 'TOOL'] = 'DEFAULT',
	**kwargs: Any,
) -> Callable[[F], F]:
	"""
	Observability decorator that traces function execution when lmnr is available.

	This decorator will use lmnr's observe decorator if lmnr is installed,
	otherwise it will be a no-op that accepts the same parameters.

	Args:
	    name: Name of the span/trace
	    ignore_input: Whether to ignore function input parameters in tracing
	    ignore_output: Whether to ignore function output in tracing
	    metadata: Additional metadata to attach to the span
	    **kwargs: Additional parameters passed to lmnr observe

	Returns:
	    Decorated function that may be traced depending on lmnr availability

	Example:
	    @observe(name="my_function", metadata={"version": "1.0"})
	    def my_function(param1, param2):
	        return param1 + param2
	"""
	return _observe_with_tags(
		name=name,
		ignore_input=ignore_input,
		ignore_output=ignore_output,
		metadata=metadata,
		span_type=span_type,
		tags=['observe', 'observe_debug'],
		enable_trace=True,
		extra_kwargs=kwargs,
	)


def observe_debug(
	name: str | None = None,
	**kwargs: Any,
) -> Callable[[F], F]:
	"""Debug-only observe wrapper; traces only when debug mode is enabled."""
	ignore_input = bool(kwargs.pop('ignore_input', False))
	ignore_output = bool(kwargs.pop('ignore_output', False))
	metadata = cast(dict[str, Any] | None, kwargs.pop('metadata', None))
	span_type = cast(Literal['DEFAULT', 'LLM', 'TOOL'], kwargs.pop('span_type', 'DEFAULT'))
	return _observe_with_tags(
		name=name,
		ignore_input=ignore_input,
		ignore_output=ignore_output,
		metadata=metadata,
		span_type=span_type,
		tags=['observe_debug'],
		enable_trace=_is_debug_mode(),
		extra_kwargs=kwargs,
	)


# Convenience functions for checking availability and debug status
def is_lmnr_available() -> bool:
	"""Check if lmnr is available for tracing."""
	return _LMNR_AVAILABLE


def is_debug_mode() -> bool:
	"""Check if we're currently in debug mode."""
	return _is_debug_mode()


def get_observability_status() -> dict[str, bool]:
	"""Get the current status of observability features."""
	return {
		'lmnr_available': _LMNR_AVAILABLE,
		'debug_mode': _is_debug_mode(),
		'observe_active': _LMNR_AVAILABLE,
		'observe_debug_active': _LMNR_AVAILABLE and _is_debug_mode(),
	}
