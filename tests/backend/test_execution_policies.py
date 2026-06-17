"""Covers execution policies behavior in the backend test suite."""

from backend.src.agent.execution.policies import ToolExecutionPolicy


def test_tool_execution_policy_identifies_bundle_by_count():
    assert ToolExecutionPolicy.is_bundle(1) is False
    assert ToolExecutionPolicy.is_bundle(2) is True
