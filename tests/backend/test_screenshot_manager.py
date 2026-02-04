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
        self._current_ocr_results = None

    def set_current_screenshot(self, screenshot_id, _data):
        self._current_screenshot_id = screenshot_id

    def get_current_screenshot_id(self):
        return self._current_screenshot_id

    def set_current_ocr_results(self, results):
        self._current_ocr_results = results


@pytest.mark.asyncio
async def test_process_screenshot_skips_ocr_when_disabled(monkeypatch):
    manager = ScreenshotManager()
    session = DummySession(ocr_service=DummyOcrService(enabled=False))
    created_tasks = []

    monkeypatch.setattr(asyncio, "create_task", lambda coro: created_tasks.append(coro))

    await manager.process_screenshot(session, "img", "req-1")

    assert created_tasks == []
    assert session.ocr_completion_event.is_set() is True
