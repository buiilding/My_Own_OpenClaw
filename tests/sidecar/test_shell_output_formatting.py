from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.system.shell_output_formatting import (  # noqa: E402
    DEFAULT_MAX_OUTPUT_TOKENS,
    format_display_output,
    format_llm_output,
    resolve_max_output_tokens,
)


def test_resolve_max_output_tokens_defaults_and_validation():
    assert resolve_max_output_tokens(None) == (DEFAULT_MAX_OUTPUT_TOKENS, None)
    assert resolve_max_output_tokens(1234) == (1234, None)
    assert resolve_max_output_tokens(True) == (None, "max_output_tokens must be an integer")
    assert resolve_max_output_tokens(0) == (None, "max_output_tokens must be greater than zero")


def test_format_llm_output_marks_truncation_and_token_stats():
    result = {
        "output": "x" * 120,
        "error": "",
        "exit_code": 0,
        "execution_time": 0.42,
        "timed_out": False,
    }
    content, truncated, original_tokens = format_llm_output(
        command="echo test",
        working_dir=Path("/tmp"),
        result=result,
        max_output_tokens=10,
    )

    assert truncated is True
    assert original_tokens > 0
    assert "tokens truncated" in content
    assert "Original output token count:" in content
    assert "Status: Success" in content


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

