from backend.src.agent.tools.shared.bundle_result_formatter import BundleResultFormatter


def test_bundle_formatter_success_includes_steps_and_state():
    bundle = {
        "status": "success",
        "step_results": [
            {"tool": "read_file", "status": "ok", "output": "done"},
            {"tool": "write_file", "status": "ok", "output": "saved"},
        ],
        "screenshot": "base64",
    }
    state = {"active_window": "Editor", "mouse_position": {"x": 1, "y": 2}, "time": "now"}

    formatted = BundleResultFormatter.format(bundle, system_state=state)

    assert "Bundled tool sequence executed successfully" in formatted
    assert "1. read_file: done" in formatted
    assert "2. write_file: saved" in formatted
    assert "<os_state>" in formatted
    assert "[Screenshot captured after bundle execution]" in formatted


def test_bundle_formatter_partial_failure_with_error():
    bundle = {
        "status": "partial_failure",
        "step_results": [
            {"tool": "read_file", "status": "ok", "output": "done"},
            {"tool": "write_file", "status": "error", "output": "no perms"},
        ],
        "error": "write failed",
    }

    formatted = BundleResultFormatter.format(bundle)

    assert "partial failures" in formatted
    assert "FAILED" in formatted
    assert "Error: write failed" in formatted
