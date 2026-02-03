from backend.src.agent.tools.waiting.receiver import ToolResultReceiver


class DummySession:
    pass


def test_receive_individual_result_sets_preformatted():
    receiver = ToolResultReceiver(DummySession())
    result = receiver.receive_individual_result(
        request_id="req",
        success=True,
        result_data={"is_preformatted": True, "output": "ok"},
        error=None,
        metadata={},
    )

    assert result.success is True
    assert result.metadata["is_preformatted"] is True


def test_receive_bundle_result_success_and_metadata():
    receiver = ToolResultReceiver(DummySession())
    bundle = receiver.receive_bundle_result(
        bundle_id="bundle-1",
        status="success",
        step_results=[{"tool": "read_file", "status": "ok", "output": "done"}],
        screenshot="shot",
        system_state={"active_window": "Editor"},
        error=None,
    )

    assert bundle.success is True
    assert bundle.metadata["is_bundled"] is True
    assert bundle.metadata["bundle_id"] == "bundle-1"
    assert bundle.data["screenshot"] == "shot"


def test_receive_bundled_results_combined_and_individual():
    receiver = ToolResultReceiver(DummySession())

    data = {
        "tools": [
            {"request_id": "r1", "tool_name": "read_file", "success": True, "data": {"ok": True}},
            {"tool_name": "missing", "success": True, "data": {"ok": True}},
        ],
        "screenshot": "shot",
        "combined_llm_content": "All done",
    }

    individual, combined, screenshot = receiver.receive_bundled_results(data, "bundle")

    assert screenshot == "shot"
    assert len(individual) == 1
    assert individual[0][0] == "r1"
    assert individual[0][1].data["screenshot"] == "shot"

    assert combined is not None
    assert combined.metadata["is_preformatted"] is True
    assert combined.metadata["is_bundled"] is True
    assert combined.metadata["bundle_request_id"] == "bundle"
    assert combined.llm_content == "All done"
