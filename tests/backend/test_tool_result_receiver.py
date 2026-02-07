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


def test_receive_bundled_results_builds_individual_and_combined():
    receiver = ToolResultReceiver(DummySession())
    bundle_data = {
        "tools": [
            {"request_id": "req-1", "tool_name": "click", "success": True, "data": {"output": "ok"}},
            {"request_id": "req-2", "tool_name": "type", "success": False, "data": {"output": "bad"}},
        ],
        "screenshot": "shot",
        "combined_llm_content": "<combined />",
    }

    individual_results, combined_result, bundle_screenshot = receiver.receive_bundled_results(
        bundle_data, "bundle-req"
    )

    assert bundle_screenshot == "shot"
    assert len(individual_results) == 2
    first_request_id, first_result = individual_results[0]
    assert first_request_id == "req-1"
    assert first_result.data["screenshot"] == "shot"

    assert combined_result is not None
    assert combined_result.success is False
    assert combined_result.metadata["is_preformatted"] is True
    assert combined_result.metadata["is_bundled"] is True
    assert combined_result.metadata["bundle_request_id"] == "bundle-req"
    assert combined_result.data["tool_count"] == 2
    assert combined_result.data["screenshot"] == "shot"
    assert combined_result.llm_content == "<combined />"


def test_receive_bundled_results_skips_missing_request_id():
    receiver = ToolResultReceiver(DummySession())
    bundle_data = {
        "tools": [
            {"tool_name": "click", "success": True, "data": {"output": "ok"}},
        ],
    }

    individual_results, combined_result, bundle_screenshot = receiver.receive_bundled_results(
        bundle_data, "bundle-req"
    )

    assert individual_results == []
    assert combined_result is None
    assert bundle_screenshot is None


def test_receive_bundled_results_ignores_non_list_tools_payload():
    receiver = ToolResultReceiver(DummySession())
    bundle_data = {
        "tools": {"request_id": "req-1"},
        "combined_llm_content": "<combined />",
    }

    individual_results, combined_result, bundle_screenshot = receiver.receive_bundled_results(
        bundle_data, "bundle-req"
    )

    assert individual_results == []
    assert combined_result is not None
    assert combined_result.success is True
    assert combined_result.data["tool_count"] == 0
    assert bundle_screenshot is None


def test_receive_bundled_results_skips_non_dict_tool_entries():
    receiver = ToolResultReceiver(DummySession())
    bundle_data = {
        "tools": [
            "not-a-dict",
            {"request_id": "req-1", "tool_name": "click", "success": True, "data": {"output": "ok"}},
        ],
    }

    individual_results, combined_result, bundle_screenshot = receiver.receive_bundled_results(
        bundle_data, "bundle-req"
    )

    assert len(individual_results) == 1
    assert individual_results[0][0] == "req-1"
    assert combined_result is None
    assert bundle_screenshot is None
