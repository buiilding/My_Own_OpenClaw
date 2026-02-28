import asyncio

import pytest

from backend.src.agent.tools.preparation.screenshot.state import ScreenshotState

def test_screenshot_state_defaults_empty():
    state = ScreenshotState()

    assert state.get_screenshot() is None
    assert state.get_ocr_results() is None
    assert state.get_current_screenshot_id() is None
    assert state.get_current_capture_meta() is None


def test_screenshot_state_sets_and_clears_ocr_on_new_screenshot():
    state = ScreenshotState()
    state.set_current_screenshot(
        "shot-1",
        "image-1",
        capture_meta={
            "screenshot_id": "shot-1",
            "source_w": 1920,
            "source_h": 1080,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )
    state.set_current_ocr_results([{"text": "one"}])

    assert state.get_current_screenshot_id() == "shot-1"
    assert state.get_screenshot() == "image-1"
    assert state.get_ocr_results() == [{"text": "one"}]
    assert state.get_current_capture_meta() is not None

    state.set_current_screenshot(
        "shot-2",
        "image-2",
        capture_meta={
            "screenshot_id": "shot-2",
            "source_w": 1000,
            "source_h": 600,
            "crop_x": 10,
            "crop_y": 20,
            "crop_w": 1000,
            "crop_h": 600,
            "desktop_virtual_bounds": {"x": 10, "y": 20, "width": 1000, "height": 600},
            "monitor_id": None,
            "timestamp": 2,
        },
    )

    assert state.get_current_screenshot_id() == "shot-2"
    assert state.get_screenshot() == "image-2"
    assert state.get_ocr_results() is None
    assert state.get_current_capture_meta() is not None


def test_screenshot_state_clear_resets_all_fields():
    state = ScreenshotState()
    state.set_current_screenshot("shot-1", "image-1")
    state.set_current_ocr_results([{"text": "one"}])

    state.clear()

    assert state.get_screenshot() is None
    assert state.get_ocr_results() is None
    assert state.get_current_screenshot_id() is None
    assert state.get_current_capture_meta() is None


@pytest.mark.asyncio
async def test_screenshot_state_active_task_matching_and_clear_behavior():
    state = ScreenshotState()
    task = asyncio.create_task(asyncio.sleep(0.1))
    other = asyncio.create_task(asyncio.sleep(0.1))
    try:
        state.set_active_ocr_task(task, "shot-1")

        assert state.get_active_ocr_task() is task
        assert state.get_active_ocr_task("shot-1") is task
        assert state.get_active_ocr_task("other-shot") is None

        state.clear_active_ocr_task(other)
        assert state.get_active_ocr_task() is task

        state.clear_active_ocr_task(task)
        assert state.get_active_ocr_task() is None
    finally:
        task.cancel()
        other.cancel()
        await asyncio.gather(task, other, return_exceptions=True)


@pytest.mark.asyncio
async def test_screenshot_state_cancel_active_task_and_clear():
    state = ScreenshotState()
    task = asyncio.create_task(asyncio.sleep(10))
    state.set_current_screenshot("shot-1", "image-1")
    state.set_current_ocr_results([{"text": "old"}])
    state.set_active_ocr_task(task, "shot-1")

    cancelled = state.cancel_active_ocr_task()

    assert cancelled is True
    assert state.get_active_ocr_task() is None
    await asyncio.gather(task, return_exceptions=True)
    assert task.cancelled() is True

    # idempotent when no task remains
    assert state.cancel_active_ocr_task() is False

    state.clear()
    assert state.get_screenshot() is None
    assert state.get_ocr_results() is None
    assert state.get_current_screenshot_id() is None
    assert state.get_current_capture_meta() is None
