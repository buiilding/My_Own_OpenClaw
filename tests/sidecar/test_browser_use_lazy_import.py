import pytest

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use._lazy_import import import_lazy, resolve_lazy_attr


def test_import_lazy_returns_module_when_attr_name_none():
	module = import_lazy(module_path='math', attr_name=None, symbol_name='math')
	assert module.sqrt(9) == 3


def test_import_lazy_returns_attribute_when_attr_name_set():
	sqrt = import_lazy(module_path='math', attr_name='sqrt', symbol_name='sqrt')
	assert sqrt(16) == 4


def test_import_lazy_raises_contextual_import_error():
	with pytest.raises(ImportError) as error:
		import_lazy(module_path='nonexistent_package_for_lazy_import', attr_name='x', symbol_name='X')

	assert 'Failed to import X from nonexistent_package_for_lazy_import' in str(error.value)


def test_resolve_lazy_attr_caches_symbol():
	cache: dict[str, object] = {}
	attr = resolve_lazy_attr(
		name='sqrt',
		lazy_imports={'sqrt': ('math', 'sqrt')},
		module_name='fake_module',
		cache=cache,
	)
	assert callable(attr)
	assert cache['sqrt'] is attr


def test_resolve_lazy_attr_raises_attribute_error_for_unknown_symbol():
	with pytest.raises(AttributeError) as error:
		resolve_lazy_attr(
			name='missing',
			lazy_imports={},
			module_name='fake_module',
		)
	assert "module 'fake_module' has no attribute 'missing'" == str(error.value)
