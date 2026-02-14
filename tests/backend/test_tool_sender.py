import pytest

from backend.src.agent.tools.preparation.preparer import PreparationResult
from backend.src.agent.tools.sending.sender import ToolSender
from backend.src.core.events.streaming_events import ToolCallEvent, ToolOutputEvent
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
    def __init__(self):
        self.pending_results = {}

    def register_pending_tool_result(self, request_id: str, result: ToolResult) -> None:
        self.pending_results[request_id] = result


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
