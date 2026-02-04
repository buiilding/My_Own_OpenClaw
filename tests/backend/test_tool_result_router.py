import pytest

from backend.src.agent.tools.waiting.router import ToolResultRouter
from backend.src.core.interfaces.tool import ToolResult


class DummySession:
    pass


class FakeScreenshotProcessor:
    def __init__(self) -> None:
        self.calls = []

    async def process_from_result(self, session, screenshot_data, request_id):
        self.calls.append((session, screenshot_data, request_id))


class FakeResultStorage:
    def __init__(self) -> None:
        self.pending = []
        self.pending_resolves = []
        self.bundled = []
        self.bundle_resolves = []

    def store_pending_result(self, request_id, result):
        self.pending.append((request_id, result))

    def resolve_result_future(self, request_id, result):
        self.pending_resolves.append((request_id, result))
        return True

    def store_bundled_result(self, bundle_id, result):
        self.bundled.append((bundle_id, result))

    def resolve_bundle_future(self, bundle_id, result):
        self.bundle_resolves.append((bundle_id, result))
        return True


@pytest.mark.asyncio
async def test_route_individual_result_processes_screenshot_and_stores():
    router = ToolResultRouter(
        receiver=None,
        screenshot_processor=FakeScreenshotProcessor(),
        result_storage=FakeResultStorage(),
        session=DummySession(),
    )
    result = ToolResult(success=True, data={"screenshot": "shot"})

    await router.route_individual_result("req-1", result)

    assert router.screenshot_processor.calls == [(router.session, "shot", "req-1")]
    assert router.result_storage.pending == [("req-1", result)]
    assert router.result_storage.pending_resolves == [("req-1", result)]


@pytest.mark.asyncio
async def test_route_individual_result_without_screenshot():
    router = ToolResultRouter(
        receiver=None,
        screenshot_processor=FakeScreenshotProcessor(),
        result_storage=FakeResultStorage(),
        session=DummySession(),
    )
    result = ToolResult(success=True, data={"output": "ok"})

    await router.route_individual_result("req-1", result)

    assert router.screenshot_processor.calls == []
    assert router.result_storage.pending == [("req-1", result)]


@pytest.mark.asyncio
async def test_route_bundle_result_processes_screenshot_and_resolves():
    router = ToolResultRouter(
        receiver=None,
        screenshot_processor=FakeScreenshotProcessor(),
        result_storage=FakeResultStorage(),
        session=DummySession(),
    )
    result = ToolResult(success=True, data={"screenshot": "shot"})

    await router.route_bundle_result("bundle-1", result)

    assert router.screenshot_processor.calls == [(router.session, "shot", "bundle-1")]
    assert router.result_storage.bundled == [("bundle-1", result)]
    assert router.result_storage.bundle_resolves == [("bundle-1", result)]


@pytest.mark.asyncio
async def test_route_bundled_results_stores_individual_and_combined():
    router = ToolResultRouter(
        receiver=None,
        screenshot_processor=FakeScreenshotProcessor(),
        result_storage=FakeResultStorage(),
        session=DummySession(),
    )
    tool_result = ToolResult(success=True)
    combined = ToolResult(success=True)

    await router.route_bundled_results(
        bundle_request_id="bundle-1",
        individual_results=[("req-1", tool_result), ("req-2", tool_result)],
        combined_result=combined,
        bundle_screenshot="shot",
    )

    assert router.screenshot_processor.calls == [(router.session, "shot", "bundle-1")]
    assert router.result_storage.pending == [
        ("req-1", tool_result),
        ("req-2", tool_result),
    ]
    assert router.result_storage.pending_resolves == [
        ("req-1", tool_result),
        ("req-2", tool_result),
    ]
    assert router.result_storage.bundled == [("bundle-1", combined)]


@pytest.mark.asyncio
async def test_route_bundled_results_without_combined_result():
    router = ToolResultRouter(
        receiver=None,
        screenshot_processor=FakeScreenshotProcessor(),
        result_storage=FakeResultStorage(),
        session=DummySession(),
    )
    tool_result = ToolResult(success=True)

    await router.route_bundled_results(
        bundle_request_id="bundle-1",
        individual_results=[("req-1", tool_result)],
        combined_result=None,
        bundle_screenshot=None,
    )

    assert router.screenshot_processor.calls == []
    assert router.result_storage.pending == [("req-1", tool_result)]
    assert router.result_storage.bundled == []
