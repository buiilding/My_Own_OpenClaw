from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.result_helpers import create_tool_result_object, create_empty_tool_results


def test_create_tool_result_object():
    tool_call = ParsedToolCall(tool_name="read_file", parameters={}, raw_call="{}")
    tool_result = ToolResult(success=True)

    obj = create_tool_result_object(tool_call, tool_result, execution_time=0.5)

    assert obj.tool_call is tool_call
    assert obj.result is tool_result
    assert obj.success is True
    assert obj.execution_time == 0.5


def test_create_empty_tool_results():
    obj = create_empty_tool_results()
    assert obj.tool_results == []
