import asyncio

import pytest

from backend.src.agent.tools.preparation.screenshot.manager import ScreenshotManager


class DummyOcrService:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled

    async def perform_ocr(self, _data):
        return [{"text": "ok"}]


class DummySession:
    def __init__(self, ocr_service):
        self.ocr_service = ocr_service
        self.ocr_completion_event = asyncio.Event()
        self.ocr_completion_event.set()
        self._current_screenshot_id = None
        self._current_screenshot = None
        self._current_ocr_results = None
        self._active_ocr_task = None
        self._active_ocr_screenshot_id = None
        self.cancel_calls = 0

    def set_current_screenshot(self, screenshot_id, data):
        self._current_screenshot_id = screenshot_id
        self._current_screenshot = data

    def get_current_screenshot_id(self):
        return self._current_screenshot_id

    def get_screenshot(self):
        return self._current_screenshot

    def set_current_ocr_results(self, results):
        self._current_ocr_results = results

    def set_active_ocr_task(self, task, screenshot_id):
        self._active_ocr_task = task
        self._active_ocr_screenshot_id = screenshot_id

    def clear_active_ocr_task(self, task):
        if self._active_ocr_task is task:
            self._active_ocr_task = None
            self._active_ocr_screenshot_id = None

    def cancel_active_ocr_task(self):
        self.cancel_calls += 1
        task = self._active_ocr_task
        if task and not task.done():
            task.cancel()
        self._active_ocr_task = None
        self._active_ocr_screenshot_id = None


@pytest.mark.asyncio
async def test_ensure_screenshot_raises_when_missing():
    manager = ScreenshotManager()
    session = DummySession(ocr_service=None)

    with pytest.raises(ValueError, match="No active screenshot available"):
        await manager.ensure_screenshot(session)


@pytest.mark.asyncio
async def test_ensure_screenshot_passes_when_current_screenshot_exists():
    manager = ScreenshotManager()
    session = DummySession(ocr_service=None)
    session.set_current_screenshot("shot-1", "image-data")

    await manager.ensure_screenshot(session)


@pytest.mark.asyncio
async def test_process_screenshot_skips_ocr_when_disabled(monkeypatch):
    manager = ScreenshotManager()
    session = DummySession(ocr_service=DummyOcrService(enabled=False))
    created_tasks = []

    monkeypatch.setattr(asyncio, "create_task", lambda coro: created_tasks.append(coro))

    await manager.process_screenshot(session, "img", "req-1")

    assert created_tasks == []
    assert session.ocr_completion_event.is_set() is True
    assert session.cancel_calls == 1


@pytest.mark.asyncio
async def test_process_screenshot_stores_id_and_data():
    manager = ScreenshotManager()
    session = DummySession(ocr_service=DummyOcrService(enabled=False))

    screenshot_id = await manager.process_screenshot(session, "img-data", "req-2")

    assert screenshot_id == manager._generate_screenshot_id("img-data")
    assert len(screenshot_id) == 16
    assert session.get_current_screenshot_id() == screenshot_id
    assert session.get_screenshot() == "img-data"


def test_generate_screenshot_id_deterministic_for_same_input():
    manager = ScreenshotManager()
    a = manager._generate_screenshot_id("same-screenshot")
    b = manager._generate_screenshot_id("same-screenshot")
    c = manager._generate_screenshot_id("different-screenshot")

    assert a == b
    assert a != c


@pytest.mark.asyncio
async def test_process_screenshot_triggers_ocr_and_stores_results():
    manager = ScreenshotManager()
    session = DummySession(ocr_service=DummyOcrService(enabled=True))

    await manager.process_screenshot(session, "img-ocr", "req-3")

    await asyncio.wait_for(session.ocr_completion_event.wait(), timeout=1.0)
    if session._active_ocr_task is not None:
        await asyncio.gather(session._active_ocr_task, return_exceptions=True)

    assert session._current_ocr_results == [{"text": "ok"}]


@pytest.mark.asyncio
async def test_process_screenshot_ignores_outdated_ocr_results():
    class SlowOcrService(DummyOcrService):
        async def perform_ocr(self, data):
            await asyncio.sleep(0.05)
            return [{"text": data}]

    manager = ScreenshotManager()
    session = DummySession(ocr_service=SlowOcrService(enabled=True))

    first_id = await manager.process_screenshot(session, "first-image", "req-a")
    second_id = await manager.process_screenshot(session, "second-image", "req-b")

    await asyncio.sleep(0.15)
    await asyncio.wait_for(session.ocr_completion_event.wait(), timeout=1.0)

    assert first_id != second_id
    assert session.get_current_screenshot_id() == second_id
    assert session._current_ocr_results == [{"text": "second-image"}]
