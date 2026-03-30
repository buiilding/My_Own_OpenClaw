from backend.src.llm.parser_types import ToolCallSchema


def test_extract_tool_call_run_shell_command_keeps_auth_mode_and_explanation():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "run_shell_command",
            "args": {
                "command": "sudo apt update",
                "run_in_background": False,
                "sudo_auth_mode": "native",
                "explanation": "canonical top-level",
            },
        }
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "run_shell_command",
        {
            "command": "sudo apt update",
            "run_in_background": False,
            "sudo_auth_mode": "native",
            "explanation": "canonical top-level",
        },
        None,
    )
