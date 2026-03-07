from backend.src.llm.parser_types import ToolCallSchema


def test_extract_tool_call_unified_system_use_run_shell_keeps_auth_mode_and_prefers_top_level_explanation():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "system_use",
            "args": {
                "tool": "run_shell_command",
                "explanation": "canonical top-level",
                "arguments": {
                    "command": "sudo apt update",
                    "run_in_background": False,
                    "sudo_auth_mode": "native",
                    "explanation": "legacy nested",
                },
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
