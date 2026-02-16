from backend.src.agent.tools.shared.bundle_result_formatter import (
    BundleResultFormatter,
    _format_system_state_xml,
)


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


def test_bundle_formatter_failure_path_and_unknown_step_fields():
    bundle = {
        "status": "failure",
        "step_results": [
            {"status": "timeout"},
        ],
    }

    formatted = BundleResultFormatter.format(bundle)

    assert "Bundled tool sequence failed:" in formatted
    assert "1. unknown: FAILED - " in formatted


def test_bundle_formatter_unknown_status_defaults_to_failed_heading():
    bundle = {
        "status": "unexpected-state",
        "step_results": [],
    }

    formatted = BundleResultFormatter.format(bundle)

    assert formatted.strip() == "Bundled tool sequence failed:"


def test_bundle_formatter_prefers_bundle_system_state_over_argument():
    bundle = {
        "status": "success",
        "step_results": [],
        "system_state": {
            "active_window": "Browser",
            "mouse_position": {"x": 10, "y": 20},
            "time": "bundle-time",
        },
    }
    fallback_state = {
        "active_window": "Editor",
        "mouse_position": {"x": 1, "y": 2},
        "time": "fallback-time",
    }

    formatted = BundleResultFormatter.format(bundle, system_state=fallback_state)

    assert "<active_window>Browser</active_window>" in formatted
    assert "<active_window>Editor</active_window>" not in formatted
    assert "<x>10</x>" in formatted
    assert "<y>20</y>" in formatted
    assert "<time>bundle-time</time>" in formatted


def test_bundle_formatter_includes_screenshot_marker_for_screenshot_ref():
    bundle = {
        "status": "success",
        "step_results": [],
        "screenshot_ref": "artifact://shot-123",
    }

    formatted = BundleResultFormatter.format(bundle)

    assert "[Screenshot captured after bundle execution]" in formatted


def test_format_system_state_xml_handles_missing_and_non_dict_mouse_position():
    xml = _format_system_state_xml(
        {
            "active_window": "Terminal",
            "mouse_position": "invalid",
        }
    )

    assert "<active_window>Terminal</active_window>" in xml
    assert "<x>0</x>" in xml
    assert "<y>0</y>" in xml
    assert "<time>Unknown</time>" in xml
