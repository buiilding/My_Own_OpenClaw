"""Covers tool result processor behavior in the backend test suite."""

from types import SimpleNamespace

import pytest

from backend.src.agent.tools.processing.processor import ToolResultProcessor
from backend.src.agent.tools.processing.transformer import ResultTransformer
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.result_types import ToolExecutionBatch, ToolExecutionResult


class _Transformer:
    async def transform(self, tool_name, result, *, model_id=None, **_kwargs):
        return SimpleNamespace(tool_name=tool_name, result=result, model_id=model_id)


class _FailingCommitter:
    def commit(self, _processed):
        raise RuntimeError("history unavailable")


class _RecordingCommitter:
    def __init__(self):
        self.commits = []

    def commit(self, processed):
        self.commits.append(processed)


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


class _ResultStorage:
    def __init__(self):
        self.cleaned_request_ids = None
        self.cleanup_old_results_called = False

    def cleanup_request_ids(self, request_ids):
        self.cleaned_request_ids = set(request_ids)
        return len(self.cleaned_request_ids)

    def cleanup_old_results(self, *, max_age_seconds):
        self.cleanup_old_results_called = max_age_seconds == 300
        return 0


class _NonBundleSession:
    cfg = SimpleNamespace(selected_model_id="model-1")

    def __init__(self):
        self.storage = _ResultStorage()
        self.removed_request_ids = []

    def get_result_storage(self):
        return self.storage

    def remove_resolved_tool_call(self, request_id):
        self.removed_request_ids.append(request_id)


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


@pytest.mark.asyncio
async def test_atomic_bundle_truncates_each_step_without_aggregate_cap(monkeypatch):
    calls = []

    def fake_truncate(tool_result, *, model_id=None):
        text = str(tool_result.data["output"])
        calls.append({"text": text, "model_id": model_id})
        if text.startswith("FIRST"):
            return (
                "FIRST bounded "
                "...[tool output truncated: original 50000 tokens, limit 10000 tokens]..."
                " tail"
            )
        return text

    monkeypatch.setattr(
        "backend.src.agent.tools.processing.processor.truncate_tool_output_for_model",
        fake_truncate,
    )

    bundle_id = "bundle-per-step"
    second_step = "SECOND_IMPORTANT_TEXT"
    session = _BundleSession(
        bundle_id,
        ToolResult(
            success=True,
            data={
                "step_results": [
                    {
                        "status": "ok",
                        "tool": "read_file",
                        "output": "FIRST " + ("x" * 20000),
                        "toolCallId": "call-first",
                    },
                    {
                        "status": "ok",
                        "tool": "read_file",
                        "output": second_step,
                        "toolCallId": "call-second",
                    },
                ],
            },
        ),
    )
    committer = _RecordingCommitter()
    processor = ToolResultProcessor(
        result_transformer=ResultTransformer(),
        history_committer=committer,
    )
    batch = ToolExecutionBatch(
        tool_results=[
            _bundle_tool_result(bundle_id, "read_file"),
            _bundle_tool_result(bundle_id, "read_file"),
        ],
    )

    await processor.process(batch, session)

    assert len(committer.commits) == 1
    committed_text = committer.commits[0].formatted_message
    assert "1. read_file: FIRST bounded" in committed_text
    assert (
        "...[tool output truncated: original 50000 tokens, limit 10000 tokens]..."
        in committed_text
    )
    assert f"2. read_file: {second_step}" in committed_text
    assert len(calls) == 2
    assert [call["model_id"] for call in calls] == ["model-1", "model-1"]
    assert session.removed_bundle_ids == [bundle_id]


@pytest.mark.asyncio
async def test_non_bundle_results_keep_existing_individual_transform_path():
    class RecordingTransformer:
        def __init__(self):
            self.calls = []

        async def transform(self, tool_name, result, *, model_id=None, **kwargs):
            self.calls.append(
                {
                    "tool_name": tool_name,
                    "result": result,
                    "model_id": model_id,
                    "kwargs": kwargs,
                }
            )
            return SimpleNamespace(tool_name=tool_name, formatted_message=result.output)

    transformer = RecordingTransformer()
    committer = _RecordingCommitter()
    processor = ToolResultProcessor(
        result_transformer=transformer,
        history_committer=committer,
    )
    session = _NonBundleSession()
    batch = ToolExecutionBatch(
        tool_results=[
            ToolExecutionResult(
                tool_call=ParsedToolCall(
                    tool_name="read_file",
                    parameters={},
                    raw_call="{}",
                    metadata={"request_id": "req-read"},
                ),
                result=ToolResult(success=True, output="file output"),
                success=True,
                execution_time=0.0,
            )
        ],
    )

    await processor.process(batch, session)

    assert [call["tool_name"] for call in transformer.calls] == ["read_file"]
    assert transformer.calls[0]["model_id"] == "model-1"
    assert transformer.calls[0]["kwargs"] == {}
    assert len(committer.commits) == 1
    assert session.storage.cleaned_request_ids == {"req-read"}
    assert session.removed_request_ids == ["req-read"]
