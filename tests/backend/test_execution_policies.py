from backend.src.agent.execution.policies import (
    ParseRecoveryPolicy,
    ToolExecutionPolicy,
)


def test_parse_recovery_policy_message_contains_format_guidance():
    message = ParseRecoveryPolicy.build_validation_error_user_message("bad payload")

    assert "System Validation Error: bad payload" in message
    assert '"functionCall": {"name": "mouse_control", "args": {"action": "click"' in message
    assert "Direct functionCall format is required" in message


def test_tool_execution_policy_identifies_bundle_by_count():
    assert ToolExecutionPolicy.is_bundle(1) is False
    assert ToolExecutionPolicy.is_bundle(2) is True
