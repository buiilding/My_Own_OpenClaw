from backend.src.agent.execution.policies import (
    IterationPolicy,
    ParseRecoveryPolicy,
    ToolExecutionPolicy,
)


def test_iteration_policy_default_flow_without_extra_turn():
    policy = IterationPolicy(max_iterations=3)

    assert policy.begin_next_iteration(0) == 1
    assert policy.should_continue(2) is True
    assert policy.should_continue(3) is False
    assert policy.can_execute_tools() is True
    assert policy.reached_hard_limit(3) is True


def test_iteration_policy_marks_extra_turn_when_tool_executes_at_limit():
    policy = IterationPolicy(max_iterations=2)

    policy.mark_tool_execution(2)

    assert policy.in_extra_turn_after_final_tools is True
    assert policy.can_execute_tools() is False
    assert policy.should_continue(2) is True
    assert policy.reached_hard_limit(2) is False


def test_iteration_policy_does_not_mark_extra_turn_below_limit():
    policy = IterationPolicy(max_iterations=2)

    policy.mark_tool_execution(1)

    assert policy.in_extra_turn_after_final_tools is False
    assert policy.can_execute_tools() is True


def test_parse_recovery_policy_message_contains_format_guidance():
    message = ParseRecoveryPolicy.build_validation_error_user_message("bad payload")

    assert "System Validation Error: bad payload" in message
    assert '"metadata": {"description": "...", "explanation": "...", "expectation": "..."}' in message
    assert "Metadata MUST come first" in message


def test_tool_execution_policy_identifies_bundle_by_count():
    assert ToolExecutionPolicy.is_bundle(1) is False
    assert ToolExecutionPolicy.is_bundle(2) is True
