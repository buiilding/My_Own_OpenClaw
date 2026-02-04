from backend.src.agent.tools.preparation.screenshot.state import ScreenshotState


def test_screenshot_state_defaults_empty():
    state = ScreenshotState()

    assert state.get_screenshot() is None
    assert state.get_ocr_results() is None
    assert state.get_current_screenshot_id() is None
    assert state.latest_screenshot is None
    assert state.latest_ocr_results is None


def test_screenshot_state_sets_and_clears_ocr_on_new_screenshot():
    state = ScreenshotState()
    state.set_current_screenshot("shot-1", "image-1")
    state.set_current_ocr_results([{"text": "one"}])

    assert state.get_current_screenshot_id() == "shot-1"
    assert state.get_screenshot() == "image-1"
    assert state.get_ocr_results() == [{"text": "one"}]

    state.set_current_screenshot("shot-2", "image-2")

    assert state.get_current_screenshot_id() == "shot-2"
    assert state.get_screenshot() == "image-2"
    assert state.get_ocr_results() is None


def test_screenshot_state_ignores_screenshot_id_in_getters():
    state = ScreenshotState()
    state.set_current_screenshot("shot-1", "image-1")
    state.set_current_ocr_results([{"text": "one"}])

    assert state.get_screenshot("other-id") == "image-1"
    assert state.get_ocr_results("other-id") == [{"text": "one"}]
