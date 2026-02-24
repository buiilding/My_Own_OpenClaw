from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.browser.watchdogs.har_recording_watchdog import _normalize_headers


def test_normalize_headers_handles_none():
	assert _normalize_headers(None) == {}


def test_normalize_headers_handles_dict():
	headers = {'Content-Type': 'text/html', 'X-Retry': 1}
	assert _normalize_headers(headers) == {'content-type': 'text/html', 'x-retry': '1'}


def test_normalize_headers_handles_name_value_list():
	headers = [
		{'name': 'Content-Length', 'value': 123},
		{'name': 'X-Trace', 'value': None},
		'invalid-entry',
	]
	assert _normalize_headers(headers) == {'content-length': '123', 'x-trace': ''}


def test_normalize_headers_handles_iterable_pairs():
	headers = (('X-A', 7), ('x-b', 'ok'))
	assert _normalize_headers(headers) == {'x-a': '7', 'x-b': 'ok'}


class _BrokenIterable:
	def __iter__(self):
		raise RuntimeError('broken')


def test_normalize_headers_falls_back_to_empty_on_iterable_error():
	assert _normalize_headers(_BrokenIterable()) == {}
