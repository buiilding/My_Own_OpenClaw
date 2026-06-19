"""Covers tool result receiver behavior in the backend test suite."""

from pathlib import Path

from backend.src.agent.tools.waiting.receiver import ToolResultReceiver
from backend.src.api.schemas.incoming import ToolBundleStepResult


class DummySession:
    pass


def _read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def test_tool_result_receiver_source_uses_local_runtime_boundary_wording():
    source = _read("backend/src/agent/tools/waiting/receiver.py")
    api_handler_source = _read("backend/src/api/handlers/tool_result.py")
    query_handler_source = _read("backend/src/api/handlers/query.py")
    api_folder_source = _read("backend/src/api/folder_structure.md")
    backend_readme = _read("docs/backend/README.md")
    runtime_flow_matrix = _read(
        "docs/backend/inventory/backend_runtime_flow_matrix_reference.md"
    )
    backend_inventory = _read(
        "docs/backend/inventory/backend_full_functionality_inventory_reference.md"
    )
    observability_reference = _read(
        "docs/backend/inventory/protocols/observability/backend_protocol_correlation_logging_and_telemetry_signal_reference.md"
    )
    architecture_docs = "\n".join(
        [
            _read("docs/architecture/tool_system.md"),
            _read("docs/architecture/architecture.md"),
            _read("docs/architecture/communication_flow.md"),
        ]
    )

    assert "SDK/local-runtime tool results" in source
    assert "local-runtime payloads" in source
    assert "SDK/local-runtime tool results" in api_folder_source
    assert "SDK/local-runtime tool results return" in backend_readme
    assert "SDK/local-runtime tool result ingress" in runtime_flow_matrix
    assert "SDK/local-runtime tool, synthetic, and bundle results" in backend_inventory
    assert "[Timing] Query received from client" in query_handler_source
    assert "[Timing] Query received from client" in observability_reference
    assert "SDK/local-runtime tool execution result" in architecture_docs
    assert "SDK/local-runtime tool result payload" in architecture_docs
    assert "from frontend" not in source
    assert "frontend format" not in source
    assert "messages from the SDK/local runtime" in api_handler_source
    assert "local-runtime path" in api_handler_source
    assert "sidecar path" not in api_handler_source
    assert "message from frontend" not in api_handler_source
    assert "tool execution results from frontend" not in api_folder_source
    assert "Tool results return from frontend" not in backend_readme
    assert "Tool result ingress from frontend" not in runtime_flow_matrix
    assert "results from frontend" not in backend_inventory
    assert "Query received from frontend" not in query_handler_source
    assert "Query received from frontend" not in observability_reference
    assert "Receives tool result from frontend" not in architecture_docs
    assert "Tool execution result from frontend" not in architecture_docs


def test_receive_individual_result_preserves_required_system_state_without_metadata_injection():
    receiver = ToolResultReceiver(DummySession())
    result = receiver.receive_individual_result(
        request_id="req-1",
        success=True,
        result_data={
            "output": "ok",
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
        capture_meta=None,
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
        capture_meta=None,
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
        capture_meta=None,
        system_state=None,
        error=None,
    )

    assert result.success is True
    assert isinstance(result.data, dict)
    assert isinstance(result.data["step_results"], list)
    assert result.data["step_results"][0]["status"] == "ok"


def test_receive_bundle_result_partial_failure_never_reports_success():
    receiver = ToolResultReceiver(DummySession())

    result = receiver.receive_bundle_result(
        bundle_id="bundle-partial",
        status="partial_failure",
        step_results=[
            {"tool": "read_file", "status": "ok", "output": "done"},
            {"tool": "write_file", "status": "ok", "output": "saved"},
        ],
        screenshot=None,
        screenshot_ref=None,
        capture_meta=None,
        system_state=None,
        error=None,
    )

    assert result.success is False
    assert result.metadata == {"is_bundled": True, "bundle_id": "bundle-partial"}


def test_receive_bundle_result_normalizes_unknown_step_payloads_to_empty_dict():
    receiver = ToolResultReceiver(DummySession())

    result = receiver.receive_bundle_result(
        bundle_id="bundle-normalize-steps",
        status="failure",
        step_results=[{"status": "ok", "output": "done"}, "bad-step-payload"],
        screenshot=None,
        screenshot_ref=None,
        capture_meta=None,
        system_state=None,
        error="failed",
    )

    assert result.success is False
    assert result.data is not None
    assert result.data["step_results"] == [
        {"status": "ok", "output": "done"},
        {},
    ]
