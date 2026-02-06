"""Tests for tool result helper functions."""
from types import SimpleNamespace
import pytest
from unittest.mock import MagicMock

from backend.src.tools.result_helpers import (
    create_tool_result_object,
    create_empty_tool_results,
)
from backend.src.core.interfaces.tool import ToolResult


@pytest.fixture
def mock_tool_call():
    """Create a mock tool call for testing."""
    mock = MagicMock()
    mock.tool_name = "test_tool"
    return mock


@pytest.fixture
def success_tool_result():
    """Create a successful tool result for testing."""
    return ToolResult(success=True, data="test output", llm_content="test output")


@pytest.fixture
def failed_tool_result():
    """Create a failed tool result for testing."""
    return ToolResult(success=False, error="failed", llm_content="Error: failed")
from backend.src.llm.parser import ParsedToolCall


class TestCreateToolResultObject:
    """Tests for create_tool_result_object function."""

    def test_create_with_defaults(self, mock_tool_call, success_tool_result):
        result = create_tool_result_object(mock_tool_call, success_tool_result)
        
        assert isinstance(result, SimpleNamespace)
        assert result.tool_call is mock_tool_call
        assert result.result is success_tool_result
        assert result.success is True
        assert result.execution_time == 0.1  # Default value
        assert result.context is None

    def test_create_with_custom_execution_time(self, mock_tool_call, success_tool_result):
        result = create_tool_result_object(mock_tool_call, success_tool_result, execution_time=1.5)
        
        assert result.execution_time == 1.5

    def test_create_with_failed_result(self, mock_tool_call, failed_tool_result):
        result = create_tool_result_object(mock_tool_call, failed_tool_result)
        
        assert result.success is False
        assert result.result.error == "failed"

    def test_create_preserves_tool_call_reference(self, mock_tool_call, success_tool_result):
        mock_tool_call.tool_name = "test_tool"
        
        result = create_tool_result_object(mock_tool_call, success_tool_result)
        
        assert result.tool_call.tool_name == "test_tool"


class TestCreateEmptyToolResults:
    """Tests for create_empty_tool_results function."""

    def test_create_returns_simple_namespace(self):
        result = create_empty_tool_results()
        
        assert isinstance(result, SimpleNamespace)

    def test_create_has_empty_tool_results(self):
        result = create_empty_tool_results()
        
        assert result.tool_results == []
        assert isinstance(result.tool_results, list)

    def test_create_returns_new_instance_each_call(self):
        result1 = create_empty_tool_results()
        result2 = create_empty_tool_results()
        
        assert result1 is not result2
        result1.tool_results.append("item")
        assert result2.tool_results == []  # Should be independent
