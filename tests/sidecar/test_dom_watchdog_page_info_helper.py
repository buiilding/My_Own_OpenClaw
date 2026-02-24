from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.browser.watchdogs.dom_watchdog import _build_fallback_page_info


def test_build_fallback_page_info_uses_default_viewport():
	page_info = _build_fallback_page_info()

	assert page_info.viewport_width == 1280
	assert page_info.viewport_height == 720
	assert page_info.page_width == 1280
	assert page_info.page_height == 720
	assert page_info.scroll_x == 0
	assert page_info.scroll_y == 0
	assert page_info.pixels_above == 0
	assert page_info.pixels_below == 0
	assert page_info.pixels_left == 0
	assert page_info.pixels_right == 0


def test_build_fallback_page_info_uses_profile_viewport():
	page_info = _build_fallback_page_info({'width': 1440, 'height': 900})

	assert page_info.viewport_width == 1440
	assert page_info.viewport_height == 900
	assert page_info.page_width == 1440
	assert page_info.page_height == 900
