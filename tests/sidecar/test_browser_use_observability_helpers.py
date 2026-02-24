import pytest

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

import browser_use.observability as observability


def _install_resolve_capture(monkeypatch):
	captured: dict[str, object] = {}

	def _fake_resolve(*, decorator_kwargs, enable_trace):
		captured['decorator_kwargs'] = decorator_kwargs
		captured['enable_trace'] = enable_trace
		return observability._create_no_op_decorator(**decorator_kwargs)

	monkeypatch.setattr(observability, '_resolve_observe_decorator', _fake_resolve)
	return captured


def test_build_observe_kwargs_includes_tags_and_extras():
	kwargs = observability._build_observe_kwargs(
		name='test-span',
		ignore_input=True,
		ignore_output=False,
		metadata={'k': 'v'},
		span_type='TOOL',
		tags=['observe_debug'],
		extra_kwargs={'custom': 1},
	)

	assert kwargs['name'] == 'test-span'
	assert kwargs['ignore_input'] is True
	assert kwargs['ignore_output'] is False
	assert kwargs['metadata'] == {'k': 'v'}
	assert kwargs['span_type'] == 'TOOL'
	assert kwargs['tags'] == ['observe_debug']
	assert kwargs['custom'] == 1


def test_observe_uses_noop_when_lmnr_disabled(monkeypatch):
	monkeypatch.setattr(observability, '_LMNR_AVAILABLE', False)
	monkeypatch.setattr(observability, '_lmnr_observe', None)

	@observability.observe(name='sync_fn')
	def _sync_fn(value: int) -> int:
		return value + 1

	assert _sync_fn(2) == 3


def test_observe_with_tags_builds_and_forwards_kwargs(monkeypatch):
	captured = _install_resolve_capture(monkeypatch)

	decorator = observability._observe_with_tags(
		name='custom-span',
		ignore_input=True,
		ignore_output=True,
		metadata={'source': 'test'},
		span_type='DEFAULT',
		tags=['observe_debug'],
		enable_trace=False,
		extra_kwargs={'custom': 7},
	)

	@decorator
	def _fn(value: int) -> int:
		return value + 1

	assert _fn(2) == 3
	assert captured['enable_trace'] is False
	assert captured['decorator_kwargs']['tags'] == ['observe_debug']
	assert captured['decorator_kwargs']['custom'] == 7


@pytest.mark.asyncio
async def test_observe_debug_uses_noop_when_lmnr_disabled(monkeypatch):
	monkeypatch.setattr(observability, '_LMNR_AVAILABLE', False)
	monkeypatch.setattr(observability, '_lmnr_observe', None)
	monkeypatch.setattr(observability, '_is_debug_mode', lambda: True)

	@observability.observe_debug(name='async_fn')
	async def _async_fn(value: int) -> int:
		return value + 2

	assert await _async_fn(3) == 5


def test_observe_debug_accepts_core_kwargs(monkeypatch):
	captured = _install_resolve_capture(monkeypatch)
	monkeypatch.setattr(observability, '_is_debug_mode', lambda: True)

	@observability.observe_debug(
		name='debug-span',
		ignore_input=True,
		ignore_output=False,
		metadata={'m': 1},
		span_type='TOOL',
		custom=9,
	)
	def _fn(value: int) -> int:
		return value

	assert _fn(4) == 4
	assert captured['enable_trace'] is True
	assert captured['decorator_kwargs']['name'] == 'debug-span'
	assert captured['decorator_kwargs']['ignore_input'] is True
	assert captured['decorator_kwargs']['span_type'] == 'TOOL'
	assert captured['decorator_kwargs']['custom'] == 9
