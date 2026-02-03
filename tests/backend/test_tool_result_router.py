import pytest

from backend.src.agent.tools.waiting.router import ToolResultRouter
from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
from backend.src.core.interfaces.tool import ToolResult


class DummySession:
    pass


class DummyScreenshotProcessor:
    def __init__(self):
        self.calls = []

    async def process_from_result(self, session, screenshot_data, context_id):
        self.calls.append((session, screenshot_data, context_id))


@pytest.mark.asyncio
async def test_route_individual_result_processes_screenshot_and_resolves():
    storage = ToolResultStorage()
    processor = DummyScreenshotProcessor()
    router = ToolResultRouter(receiver=None, screenshot_processor=processor, result_storage=storage, session=DummySession())

    future = storage.create_result_future("req-1")
    tool_result = ToolResult(success=True, data={"screenshot": "shot"})

    await router.route_individual_result("req-1", tool_result)

    assert processor.calls
    assert storage.get_pending_result("req-1") == tool_result
    assert future.done() is True


@pytest.mark.asyncio
async def test_route_bundle_result_stores_and_resolves():
    storage = ToolResultStorage()
    processor = DummyScreenshotProcessor()
    router = ToolResultRouter(receiver=None, screenshot_processor=processor, result_storage=storage, session=DummySession())

    future = storage.create_bundle_future("bundle-1")
    tool_result = ToolResult(success=True, data={"screenshot": "shot"})

    await router.route_bundle_result("bundle-1", tool_result)

    assert processor.calls
    assert storage.get_bundled_result("bundle-1") == tool_result
    assert future.done() is True


@pytest.mark.asyncio
async def test_route_bundled_results_stores_individual_and_combined():
    storage = ToolResultStorage()
    processor = DummyScreenshotProcessor()
    router = ToolResultRouter(receiver=None, screenshot_processor=processor, result_storage=storage, session=DummySession())

    future = storage.create_result_future("req-1")
    individual_results = [("req-1", ToolResult(success=True, data={"value": 1}))]
    combined = ToolResult(success=True, data={"bundled": True})

    await router.route_bundled_results("bundle-1", individual_results, combined, "shot")

    assert processor.calls
    assert storage.get_pending_result("req-1") == individual_results[0][1]
    assert future.done() is True
    assert storage.get_bundled_result("bundle-1") == combined
