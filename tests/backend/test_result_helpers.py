"""Tests for tool result helper functions."""
from types import SimpleNamespace
import pytest
from unittest.mock import MagicMock

from backend.src.tools.result_helpers import (
    create_tool_result_object,
    create_empty_tool_results,
)
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall


class TestCreateToolResultObject:
    """Tests for create_tool_result_object function."""

    def test_create_with_defaults(self):
        tool_call = MagicMock(spec=ParsedToolCall)
        tool_result = ToolResult(success=True, output="test output")
        
        result = create_tool_result_object(tool_call, tool_result)
        
        assert isinstance(result, SimpleNamespace)
        assert result.tool_call is tool_call
        assert result.result is tool_result
        assert result.success is True
        assert result.execution_time == 0.1  # Default value
        assert result.context is None

    def test_create_with_custom_execution_time(self):
        tool_call = MagicMock(spec=ParsedToolCall)
        tool_result = ToolResult(success=True, output="test")
        
        result = create_tool_result_object(tool_call, tool_result, execution_time=1.5)
        
        assert result.execution_time == 1.5

    def test_create_with_failed_result(self):
        tool_call = MagicMock(spec=ParsedToolCall)
        tool_result = ToolResult(success=False, output="", error="failed")
        
        result = create_tool_result_object(tool_call, tool_result)
        
        assert result.success is False
        assert result.result.error == "failed"

    def test_create_preserves_tool_call_reference(self):
        tool_call = MagicMock(spec=ParsedToolCall)
        tool_call.tool_name = "test_tool"
        tool_result = ToolResult(success=True, output="test")
        
        result = create_tool_result_object(tool_call, tool_result)
        
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
