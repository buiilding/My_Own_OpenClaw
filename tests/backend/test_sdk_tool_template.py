from backend.src.tools.templates.sdk_tool_template.tool import ExampleTool


def test_example_tool_process_input_keeps_zero_optional_value() -> None:
    tool = ExampleTool()

    assert tool._process_input("input", 0) == "Processed input with option 0"


def test_example_tool_process_input_omits_absent_optional_value() -> None:
    tool = ExampleTool()

    assert tool._process_input("input", None) == "Processed input"
