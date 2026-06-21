"""Covers local-runtime shell output formatting behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.system.shell_output_formatting import (  # noqa: E402
    format_display_output,
)


def test_format_display_output_handles_success_failure_timeout():
    success = format_display_output({
        "output": "ok",
        "error": "",
        "exit_code": 0,
        "timed_out": False,
    })
    assert success.startswith("Command completed successfully")

    failure = format_display_output({
        "output": "",
        "error": "boom",
        "exit_code": 2,
        "timed_out": False,
    })
    assert failure.startswith("Command failed with exit code 2")
    assert "Error:\nboom" in failure

    timeout = format_display_output({
        "output": "",
        "error": "",
        "exit_code": None,
        "timed_out": True,
    })
    assert timeout.startswith("Command timed out and was terminated")
