"""Shared helpers for lazy import call sites."""

from typing import Any, Mapping, MutableMapping


def import_lazy(*, module_path: str, attr_name: str | None, symbol_name: str) -> Any:
	"""Import a module/attribute with a consistent ImportError message."""
	try:
		from importlib import import_module

		module = import_module(module_path)
		return module if attr_name is None else getattr(module, attr_name)
	except ImportError as e:
		raise ImportError(f'Failed to import {symbol_name} from {module_path}: {e}') from e


def resolve_lazy_attr(
	*,
	name: str,
	lazy_imports: Mapping[str, tuple[str, str | None]],
	module_name: str,
	cache: MutableMapping[str, Any] | None = None,
) -> Any:
	"""Resolve one lazy symbol and optionally cache it."""
	if name not in lazy_imports:
		raise AttributeError(f"module '{module_name}' has no attribute '{name}'")

	module_path, attr_name = lazy_imports[name]
	attr = import_lazy(module_path=module_path, attr_name=attr_name, symbol_name=name)
	if cache is not None:
		cache[name] = attr
	return attr
