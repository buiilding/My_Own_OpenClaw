from backend.src.agent.tools.waiting.receiver import ToolResultReceiver


class DummySession:
    pass


def test_receive_individual_result_sets_preformatted_metadata():
    receiver = ToolResultReceiver(DummySession())
    metadata = {}
    result = receiver.receive_individual_result(
        request_id="req-1",
        success=True,
        result_data={"is_preformatted": True, "output": "ok"},
        error=None,
        metadata=metadata,
    )

    assert result.success is True
    assert result.metadata == {"is_preformatted": True}
    assert metadata == {"is_preformatted": True}


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
