import pytest

from backend.src.agent.tools.preparation.preparer import PreparationResult
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.agent.tools.sending.sender import ToolSender
from backend.src.core.events.streaming_events import ToolBundleEvent, ToolCallEvent, ToolOutputEvent
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser_types import ParsedToolCall


class _DummyPreparer:
    def __init__(self, result: PreparationResult):
        self._result = result

    async def prepare(self, _tool_calls, _session) -> PreparationResult:
        return self._result


class _DummySyntheticResultFactory:
    @staticmethod
    def create(_tool_call: ParsedToolCall, error_msg: str) -> ToolResult:
        return ToolResult(success=False, error=error_msg, llm_content=error_msg)


class _DummySession:
    class _DummyResultStorage:
        def __init__(self):
            self.bundled_results = {}

        def store_bundled_result(self, bundle_id: str, result: ToolResult) -> None:
            self.bundled_results[bundle_id] = result

        def resolve_bundle_future(self, _bundle_id: str, _result: ToolResult) -> bool:
            return False

    def __init__(self):
        self.pending_results = {}
        self.result_storage = self._DummyResultStorage()

    def register_pending_tool_result(self, request_id: str, result: ToolResult) -> None:
        self.pending_results[request_id] = result

    def get_result_storage(self):
        return self.result_storage


@pytest.mark.asyncio
async def test_send_tools_marks_failed_coordinate_resolution_as_non_executable():
    request_id = "req-123"
    failed_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click"},
        metadata={
            "request_id": request_id,
            "description": "Chrome window is open",
            "explanation": "Clicking the target",
            "expectation": "Click should focus element",
        },
    )

    sender = ToolSender(
        preparer=_DummyPreparer(
            PreparationResult(
                resolved_calls=[],
                errors=[(failed_call, "OCR could not find target text")],
                bundle_id=None,
            )
        ),
        synthetic_result_factory=_DummySyntheticResultFactory(),
    )
    session = _DummySession()

    emitted = []
    async for event in sender.send_tools([failed_call], session):
        emitted.append(event)

    assert len(emitted) == 2
    assert isinstance(emitted[0], ToolCallEvent)
    assert emitted[0].metadata["coordinate_resolution_failed"] is True
    assert emitted[0].metadata["skip_frontend_execution"] is True
    assert emitted[0].metadata["request_id"] == request_id

    assert isinstance(emitted[1], ToolOutputEvent)
    assert emitted[1].metadata["coordinate_resolution_failed"] is True
    assert emitted[1].metadata["skip_frontend_execution"] is True

    assert request_id in session.pending_results
    assert session.pending_results[request_id].error == "OCR could not find target text"


@pytest.mark.asyncio
async def test_send_tools_does_not_dispatch_bundle_when_preparation_fails():
    bundle_id = "bundle-123"
    first_call = ParsedToolCall(
        tool_name="keyboard_control",
        parameters={"action": "type", "text": "hello"},
        metadata={"bundle_id": bundle_id},
    )
    failed_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "find_coordinates_by": "ocr", "ocr_text": "Add to cart"},
        metadata={"bundle_id": bundle_id},
    )
    resolved_first_call = ResolvedToolCall.from_parsed_call(first_call)

    sender = ToolSender(
        preparer=_DummyPreparer(
            PreparationResult(
                resolved_calls=[resolved_first_call],
                errors=[
                    (
                        failed_call,
                        "Identical instances found for OCR text 'Add to cart': Add to cart (150, 210).",
                    )
                ],
                bundle_id=bundle_id,
            )
        ),
        synthetic_result_factory=_DummySyntheticResultFactory(),
    )
    session = _DummySession()

    emitted = []
    async for event in sender.send_tools([first_call, failed_call], session):
        emitted.append(event)

    assert all(not isinstance(event, ToolBundleEvent) for event in emitted)
    assert all(not isinstance(event, ToolCallEvent) for event in emitted)
    assert bundle_id in session.result_storage.bundled_results
    bundle_result = session.result_storage.bundled_results[bundle_id]
    assert bundle_result.success is False
    assert "Identical instances found" in (bundle_result.error or "")
    assert isinstance(bundle_result.data, dict)
    assert bundle_result.data.get("status") == "failure"


@pytest.mark.asyncio
async def test_send_tools_includes_model_facing_tool_call_metadata():
    request_id = "req-789"
    parsed_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "click",
            "find_coordinates_by": "ocr",
            "ocr_text": "Settings",
        },
        metadata={
            "request_id": request_id,
            "tool_call_id": "tool_llm_1",
        },
    )
    resolved_call = ResolvedToolCall.from_parsed_call(parsed_call)
    resolved_call.parameters = {
        "action": "click",
        "x": 122,
        "y": 418,
    }

    sender = ToolSender(
        preparer=_DummyPreparer(
            PreparationResult(
                resolved_calls=[resolved_call],
                errors=[],
                bundle_id=None,
            )
        ),
        synthetic_result_factory=_DummySyntheticResultFactory(),
    )
    session = _DummySession()

    emitted = []
    async for event in sender.send_tools([parsed_call], session):
        emitted.append(event)

    assert len(emitted) == 1
    assert isinstance(emitted[0], ToolCallEvent)
    assert emitted[0].parameters == {"action": "click", "x": 122, "y": 418}
    assert emitted[0].metadata is not None
    assert emitted[0].metadata["model_facing_tool_call"] == {
        "id": "tool_llm_1",
        "name": "mouse_control",
        "arguments": {
            "action": "click",
            "find_coordinates_by": "ocr",
            "ocr_text": "Settings",
        },
    }
