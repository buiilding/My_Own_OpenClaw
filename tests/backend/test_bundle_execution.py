"""Covers bundle execution behavior in the backend test suite."""

import asyncio

import pytest

from backend.src.api.schemas.incoming import ToolBundleStepResult
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedResponse, ParsedToolCall
from backend.src.tools.bundle_execution import execute_bundle
from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage


class DummySession:
    def __init__(self):
        self._result_storage = ToolResultStorage()

    def get_result_storage(self):
        return self._result_storage


def _make_response(bundle_id="bundle", calls=None):
    if calls is None:
        calls = [
            ParsedToolCall(
                tool_name="read_file",
                parameters={},
                raw_call="{}",
                metadata={"bundle_id": bundle_id},
            ),
            ParsedToolCall(
                tool_name="write_file",
                parameters={},
                raw_call="{}",
                metadata={"bundle_id": bundle_id},
            ),
        ]
    return ParsedResponse(
        original_response="{}", tool_calls=calls, text_content="", has_tool_calls=True
    )


@pytest.mark.asyncio
async def test_execute_bundle_uses_existing_result():
    session = DummySession()
    response = _make_response()

    bundle_result = ToolResult(
        success=True,
        data={
            "step_results": [
                {"status": "ok", "output": "done"},
                {"status": "ok", "output": "saved"},
            ],
            "screenshot": "shot",
        },
    )
    session.get_result_storage().store_bundled_result("bundle", bundle_result)

    result = await execute_bundle(response, "bundle", session)

    assert len(result.tool_results) == 2
    assert session.get_result_storage().get_bundle_future("bundle") is None
    assert result.tool_results[0].result.success is True
    assert "done" in (result.tool_results[0].result.output or "")
    assert result.tool_results[1].result.success is True


@pytest.mark.asyncio
async def test_execute_bundle_timeout(monkeypatch):
    session = DummySession()
    response = _make_response("bundle-timeout")

    async def fake_wait_for(_future, timeout=None):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)

    result = await execute_bundle(response, "bundle-timeout", session)

    assert len(result.tool_results) == 2
    assert result.tool_results[0].result.success is False
    assert "timed out" in (result.tool_results[0].result.error or "").lower()


@pytest.mark.asyncio
async def test_execute_bundle_uses_adaptive_timeout_for_foreground_shell_steps(
    monkeypatch,
):
    session = DummySession()
    response = _make_response(
        "bundle-shell-timeout",
        calls=[
            ParsedToolCall(
                tool_name="run_shell_command",
                parameters={
                    "run_in_background": False,
                    "terminate_after_seconds": 180,
                    "wait": 5,
                },
                raw_call="{}",
                metadata={"bundle_id": "bundle-shell-timeout"},
            ),
            ParsedToolCall(
                tool_name="run_shell_command",
                parameters={
                    "run_in_background": False,
                    "terminate_after_seconds": 240,
                    "wait": 0,
                },
                raw_call="{}",
                metadata={"bundle_id": "bundle-shell-timeout"},
            ),
        ],
    )
    captured_timeout = {"value": None}

    async def fake_wait_for(_future, timeout=None):
        captured_timeout["value"] = timeout
        raise asyncio.TimeoutError()

    monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)

    result = await execute_bundle(response, "bundle-shell-timeout", session)

    assert len(result.tool_results) == 2
    assert result.tool_results[0].result.success is False
    assert "timed out" in (result.tool_results[0].result.error or "").lower()
    # (180 + 5 + 15) + (240 + 0 + 15) = 455
    assert captured_timeout["value"] == pytest.approx(455.0)


@pytest.mark.asyncio
async def test_execute_bundle_caps_adaptive_timeout(monkeypatch):
    session = DummySession()
    response = _make_response(
        "bundle-shell-timeout-cap",
        calls=[
            ParsedToolCall(
                tool_name="run_shell_command",
                parameters={
                    "run_in_background": False,
                    "terminate_after_seconds": 600,
                },
                raw_call="{}",
                metadata={"bundle_id": "bundle-shell-timeout-cap"},
            ),
            ParsedToolCall(
                tool_name="run_shell_command",
                parameters={
                    "run_in_background": False,
                    "terminate_after_seconds": 600,
                },
                raw_call="{}",
                metadata={"bundle_id": "bundle-shell-timeout-cap"},
            ),
        ],
    )
    captured_timeout = {"value": None}

    async def fake_wait_for(_future, timeout=None):
        captured_timeout["value"] = timeout
        raise asyncio.TimeoutError()

    monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)

    result = await execute_bundle(response, "bundle-shell-timeout-cap", session)

    assert len(result.tool_results) == 2
    assert result.tool_results[0].result.success is False
    assert captured_timeout["value"] == pytest.approx(900.0)


@pytest.mark.asyncio
async def test_execute_bundle_handles_pydantic_step_results():
    session = DummySession()
    response = _make_response("bundle-model-steps")

    bundle_result = ToolResult(
        success=True,
        data={
            "step_results": [
                ToolBundleStepResult(tool="read_file", status="ok", output="done"),
                ToolBundleStepResult(tool="write_file", status="ok", output="saved"),
            ],
            "screenshot": "shot",
        },
    )
    session.get_result_storage().store_bundled_result(
        "bundle-model-steps", bundle_result
    )

    result = await execute_bundle(response, "bundle-model-steps", session)

    assert len(result.tool_results) == 2
    assert result.tool_results[0].result.success is True
    assert "done" in (result.tool_results[0].result.output or "")


@pytest.mark.asyncio
async def test_execute_bundle_uses_bundle_error_when_failed_step_has_no_output():
    session = DummySession()
    response = _make_response("bundle-no-step-output")

    bundle_result = ToolResult(
        success=False,
        error="bundle execution failed upstream",
        data={
            "step_results": [
                {"status": "ok", "output": "done"},
                {"status": "error", "output": ""},
            ],
        },
    )
    session.get_result_storage().store_bundled_result(
        "bundle-no-step-output",
        bundle_result,
    )

    result = await execute_bundle(response, "bundle-no-step-output", session)

    assert len(result.tool_results) == 2
    assert result.tool_results[0].result.success is True
    assert result.tool_results[1].result.success is False
    assert result.tool_results[1].result.error == "bundle execution failed upstream"


@pytest.mark.asyncio
async def test_execute_bundle_marks_missing_step_results_as_failed():
    session = DummySession()
    response = _make_response("bundle-missing-step")

    bundle_result = ToolResult(
        success=False,
        error="bundle returned fewer step results than expected",
        data={
            "step_results": [
                {"status": "ok", "output": "done"},
            ],
        },
    )
    session.get_result_storage().store_bundled_result("bundle-missing-step", bundle_result)

    result = await execute_bundle(response, "bundle-missing-step", session)

    assert len(result.tool_results) == 2
    assert result.tool_results[0].result.success is True
    assert result.tool_results[1].result.success is False
    assert result.tool_results[1].result.error == "bundle returned fewer step results than expected"
