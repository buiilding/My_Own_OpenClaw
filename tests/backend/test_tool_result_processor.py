from types import SimpleNamespace

import pytest

from backend.src.agent.tools.processing.processor import ToolResultProcessor
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.result_types import ToolExecutionBatch, ToolExecutionResult


class _Transformer:
    async def transform(self, tool_name, result, *, model_id=None):
        return SimpleNamespace(tool_name=tool_name, result=result, model_id=model_id)


class _FailingCommitter:
    def commit(self, _processed):
        raise RuntimeError("history unavailable")


class _BundleSession:
    cfg = SimpleNamespace(selected_model_id="model-1")

    def __init__(self, bundle_id: str, bundle_result: ToolResult):
        self.bundle_id = bundle_id
        self.bundle_result = bundle_result
        self.removed_bundle_ids = []

    def get_bundle_result(self, bundle_id: str):
        if bundle_id == self.bundle_id:
            return self.bundle_result
        return None

    def remove_bundle_result(self, bundle_id: str):
        self.removed_bundle_ids.append(bundle_id)
        return bundle_id == self.bundle_id


def _bundle_tool_result(bundle_id: str, tool_name: str) -> ToolExecutionResult:
    return ToolExecutionResult(
        tool_call=ParsedToolCall(
            tool_name=tool_name,
            parameters={},
            raw_call="{}",
            metadata={"bundle_id": bundle_id},
        ),
        result=ToolResult(success=True),
        success=True,
        execution_time=0.0,
    )


@pytest.mark.asyncio
async def test_atomic_bundle_result_is_removed_when_history_commit_fails():
    bundle_id = "bundle-cleanup"
    session = _BundleSession(
        bundle_id,
        ToolResult(
            success=True,
            data={
                "step_results": [
                    {"status": "ok", "tool": "click", "output": "clicked"},
                    {"status": "ok", "tool": "type", "output": "typed"},
                ],
            },
        ),
    )
    processor = ToolResultProcessor(
        result_transformer=_Transformer(),
        history_committer=_FailingCommitter(),
    )
    batch = ToolExecutionBatch(
        tool_results=[
            _bundle_tool_result(bundle_id, "click"),
            _bundle_tool_result(bundle_id, "type"),
        ],
    )

    with pytest.raises(RuntimeError, match="history unavailable"):
        await processor.process(batch, session)

    assert session.removed_bundle_ids == [bundle_id]
