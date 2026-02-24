"""Shared helpers for lazy import call sites."""

from typing import Any


def import_lazy(*, module_path: str, attr_name: str | None, symbol_name: str) -> Any:
	"""Import a module/attribute with a consistent ImportError message."""
	try:
		from importlib import import_module

		module = import_module(module_path)
		return module if attr_name is None else getattr(module, attr_name)
	except ImportError as e:
		raise ImportError(f'Failed to import {symbol_name} from {module_path}: {e}') from e
