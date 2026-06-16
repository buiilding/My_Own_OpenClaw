"""Covers ocr coordinator behavior in the backend test suite."""

import asyncio

import pytest

from backend.src.agent.tools.preparation.ocr.coordinator import OcrCoordinator


class _FakeOcrService:
    enabled = True

    def __init__(self, result):
        self.result = result
        self.calls = []

    async def perform_ocr(self, screenshot_data):
        self.calls.append(screenshot_data)
        return self.result


class _FakeOcrRuntimeState:
    def __init__(self, current_screenshot_id, active_task=None):
        self._current_screenshot_id = current_screenshot_id
        self._active_task = active_task
        self._results = None
        self.set_results_calls = []

    def get_active_task(self, _screenshot_id=None):
        return self._active_task

    def get_current_screenshot_id(self):
        return self._current_screenshot_id

    def get_results(self):
        return self._results

    def set_results(self, results):
        self.set_results_calls.append(results)
        self._results = results


class _FakeSession:
    def __init__(self, current_screenshot_id, ocr_router, active_task=None):
        self.ocr_router = ocr_router
        self._ocr_state = _FakeOcrRuntimeState(current_screenshot_id, active_task)

    def get_current_screenshot_id(self):
        return self._ocr_state.get_current_screenshot_id()

    def get_ocr_runtime_state(self):
        return self._ocr_state


@pytest.mark.asyncio
async def test_get_ocr_results_does_not_cache_mismatched_fallback_results():
    stale_result = [{"text": "stale screenshot text"}]
    session = _FakeSession(
        current_screenshot_id="current-shot",
        ocr_router=_FakeOcrService(stale_result),
    )

    results = await OcrCoordinator().get_ocr_results(
        session,
        screenshot_data="stale-image",
        screenshot_id="stale-shot",
    )

    assert results == stale_result
    assert session.ocr_router.calls == ["stale-image"]
    assert session.get_ocr_runtime_state().get_results() is None
    assert session.get_ocr_runtime_state().set_results_calls == []


@pytest.mark.asyncio
async def test_get_ocr_results_caches_fallback_results_for_current_screenshot():
    current_result = [{"text": "current screenshot text"}]
    session = _FakeSession(
        current_screenshot_id="current-shot",
        ocr_router=_FakeOcrService(current_result),
    )

    results = await OcrCoordinator().get_ocr_results(
        session,
        screenshot_data="current-image",
        screenshot_id="current-shot",
    )

    assert results == current_result
    assert session.get_ocr_runtime_state().get_results() == current_result
    assert session.get_ocr_runtime_state().set_results_calls == [current_result]


@pytest.mark.asyncio
async def test_get_ocr_results_falls_back_when_proactive_task_fails():
    async def _failed_proactive_ocr():
        raise RuntimeError("proactive OCR failed")

    active_task = asyncio.create_task(_failed_proactive_ocr())
    await asyncio.sleep(0)
    fallback_result = [{"text": "fallback text"}]
    session = _FakeSession(
        current_screenshot_id="current-shot",
        ocr_router=_FakeOcrService(fallback_result),
        active_task=active_task,
    )

    results = await OcrCoordinator().get_ocr_results(
        session,
        screenshot_data="current-image",
        screenshot_id="current-shot",
    )

    assert results == fallback_result
    assert session.ocr_router.calls == ["current-image"]
    assert session.get_ocr_runtime_state().set_results_calls == [fallback_result]


@pytest.mark.asyncio
async def test_get_ocr_results_uses_router_for_on_demand_ocr():
    current_result = [{"text": "router OCR text"}]
    ocr_router = _FakeOcrService(current_result)
    session = _FakeSession(
        current_screenshot_id="current-shot",
        ocr_router=ocr_router,
    )

    results = await OcrCoordinator().get_ocr_results(
        session,
        screenshot_data="current-image",
        screenshot_id="current-shot",
    )

    assert results == current_result
    assert ocr_router.calls == ["current-image"]
    assert session.get_ocr_runtime_state().set_results_calls == [current_result]
