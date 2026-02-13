from backend.src.agent.tools.waiting.receiver import ToolResultReceiver
from backend.src.api.schemas.incoming import ToolBundleStepResult


class DummySession:
    pass


def test_receive_individual_result_preserves_required_system_state_without_metadata_injection():
    receiver = ToolResultReceiver(DummySession())
    result = receiver.receive_individual_result(
        request_id="req-1",
        success=True,
        result_data={
            "llm_content": "ok",
            "system_state": {
                "active_window": "Terminal",
                "mouse_position": "(845, 512)",
            },
            "output": "ok",
        },
        error=None,
    )

    assert result.success is True
    assert result.metadata is None
    assert result.data["system_state"]["active_window"] == "Terminal"
    assert result.data["system_state"]["mouse_position"] == "(845, 512)"


def test_receive_bundle_result_success_and_failure():
    receiver = ToolResultReceiver(DummySession())

    success_result = receiver.receive_bundle_result(
        bundle_id="bundle-1",
        status="success",
        step_results=[{"status": "ok"}, {"status": "ok"}],
        screenshot=None,
        screenshot_ref=None,
        system_state=None,
        error=None,
    )
    assert success_result.success is True
    assert success_result.metadata == {"is_bundled": True, "bundle_id": "bundle-1"}

    failure_result = receiver.receive_bundle_result(
        bundle_id="bundle-2",
        status="success",
        step_results=[{"status": "ok"}, {"status": "error"}],
        screenshot=None,
        screenshot_ref=None,
        system_state=None,
        error=None,
    )
    assert failure_result.success is False


def test_receive_bundle_result_accepts_pydantic_step_models():
    receiver = ToolResultReceiver(DummySession())

    result = receiver.receive_bundle_result(
        bundle_id="bundle-3",
        status="success",
        step_results=[
            ToolBundleStepResult(tool="read_file", status="ok", output="done"),
            ToolBundleStepResult(tool="write_file", status="ok", output="saved"),
        ],
        screenshot=None,
        screenshot_ref=None,
        system_state=None,
        error=None,
    )

    assert result.success is True
    assert isinstance(result.data, dict)
    assert isinstance(result.data["step_results"], list)
    assert result.data["step_results"][0]["status"] == "ok"
