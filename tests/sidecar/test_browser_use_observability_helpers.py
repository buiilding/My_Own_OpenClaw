import pytest

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

import browser_use.observability as observability


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


@pytest.mark.asyncio
async def test_observe_debug_uses_noop_when_lmnr_disabled(monkeypatch):
	monkeypatch.setattr(observability, '_LMNR_AVAILABLE', False)
	monkeypatch.setattr(observability, '_lmnr_observe', None)
	monkeypatch.setattr(observability, '_is_debug_mode', lambda: True)

	@observability.observe_debug(name='async_fn')
	async def _async_fn(value: int) -> int:
		return value + 2

	assert await _async_fn(3) == 5
